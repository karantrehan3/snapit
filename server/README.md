# snapit server — connected mode prototype

**Status: exploration. Nothing in `src/main`, `src/preload` or `src/renderer` imports anything here,
and the Electron build does not reference this directory.** The desktop app is byte-for-byte
unchanged. This is a separate package with its own `package.json`, `tsconfig.json` and test run, so
`npm test` at the repo root neither runs these tests nor can be broken by them.

---

## Read this before anything else

**`docs/ROADMAP.md` now has a Phase 3 that supersedes this section.** Read that first: it is the
decision, and this README is the thing that priced it. The refusal it used to contradict has been
narrowed rather than dropped —

> **Operating a service** — the fight is not sharing and never was. […] What is refused is snapit
> running the infrastructure: no hosted tier, no snapit-owned bucket, no free-trial storage, at any
> price. Phase 3 ships a server the _customer_ runs; it does not make snapit one.
> — `docs/ROADMAP.md`, _Scope discipline_, amended 2026-09-19

Two things settled in Phase 3 that this prototype predates, and that its code does **not** yet
reflect:

1. **Roles are `owner / admin / user`.** `src/domain/rbac.ts` still implements
   `admin / developer / viewer`.
2. **M3.0 comes first.** A `CaptureStore` / `Identity` refactor lands in the desktop app, local-only
   and behaviour-preserving, before any of this is wired up. Nothing here should be adopted ahead of
   it.

M1.7 priced a hosted link at four costs. Here is what this design does to each, honestly:

| M1.7's cost                                                                                                         | What this design does                                                                                                                                                                       | Settled?                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. A stored credential.** An S3 key in settings is a new class of thing to protect.                               | Moves it off the laptop: the _server_ holds the bucket credential, the desktop holds a scoped, expiring bearer token, and the key never reaches a client.                                   | **Improved, not removed.** The secret still exists, it is just somewhere with an easier threat model. Integration secrets are deliberately never written to disk — see `store/memory.ts`. |
| **2. Support surface without control.** A bucket with the wrong CORS works for the user and 403s for everyone else. | `preflight()` writes, reads back and deletes a probe object _before the server accepts connections_. A misconfigured bucket stops the process with the reason.                              | **Mostly.** Preflight cannot see a CORS policy that only a browser would trip. A real build adds a browser-side check on the first share.                                                 |
| **3. Retention moves, it does not go away.**                                                                        | Share links are 128 bits, unguessable, off by default, revocable, `no-store`, `noindex`. Keys nest `orgs/…/workspaces/…/captures/…` so a customer's own lifecycle rule can expire a prefix. | **No.** snapit still cannot expire what it does not own, and this design is what makes that the customer's job on purpose.                                                                |
| **4. It is one line from being the service.**                                                                       | Nothing here stores bytes. Storage is always the customer's, `local` is labelled dev-only, and the server never sees a recording — uploads and playback both go direct.                     | **This is the real answer.** The architecture makes "just host it for people with no bucket" a new subsystem rather than a config flag.                                                   |

**The recommendation this prototype supports:** connected mode is defensible _because_ it is
metadata-only. The moment snapit operates the bucket, M1.7's argument comes back intact.

---

## What runs, and what is shaped

Everything below was exercised end to end against a running server, not just typechecked.

| Area                            | State                                                                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageProvider` abstraction   | **Built.** Interface plus registry.                                                                                                                                                                                                                                  |
| Local filesystem provider       | **Built and exercised.** Signed URLs, streamed writes, prefix listing, atomic writes.                                                                                                                                                                                |
| S3 / MinIO / R2 provider        | **Built.** SigV4 presigning verified against AWS's published canonical-request hash _and_ differentially against `aws4@1.13.2` (7/8 cases identical; the 8th is an `aws4` divergence on `+` — see `storage/tests/sigv4.spec.ts`). Not yet run against a live bucket. |
| Azure Blob / GCS                | **Shaped, not built.** Each fails at boot naming exactly what it needs. GCS has a working route today via the S3 endpoint — see `storage/gcs.ts`.                                                                                                                    |
| Two-phase direct upload         | **Built and exercised.**                                                                                                                                                                                                                                             |
| Org / workspace / member model  | **Built.**                                                                                                                                                                                                                                                           |
| Admin / developer / viewer RBAC | **Built and exercised.**                                                                                                                                                                                                                                             |
| Share link + viewer             | **Built and exercised**, including revocation.                                                                                                                                                                                                                       |
| Jira                            | **Document builder built and tested; the POST is written but never run against a live Jira.**                                                                                                                                                                        |
| Slack                           | **Block Kit builder built and tested; the webhook POST is written but never run.**                                                                                                                                                                                   |
| Auth                            | **Prototype stand-in.** HMAC bearer tokens. A real build puts OIDC here — see `auth/tokens.ts`.                                                                                                                                                                      |
| Metadata store                  | **Prototype.** JSON snapshot behind a `MetadataStore` interface. One process only.                                                                                                                                                                                   |

---

## The one number that shapes the architecture

A snapit recording is routinely 150 MB and a long one is 560 MB (`docs/STATUS.md` has the
measurements). Every significant decision here follows from refusing to put that through the server:

```
Desktop                     Server                      Customer's bucket
   │                           │                                │
   ├── POST …/captures ───────►│  records a `pending` capture    │
   │◄── presigned PUT × n ─────┤  mints one URL per file         │
   │                           │                                │
   ├───────────── PUT bytes ───┼───────────────────────────────►│   ← never touches the server
   │                           │                                │
   ├── POST …/complete ───────►│  HEADs every object, then       │
   │◄── shareUrl ──────────────┤  builds the manifest            │
                               │                                │
Viewer ── GET /capture/:slug ─►│  shell page                     │
       ── GET …/report ───────►│  ~100 KB, media src rewritten   │
       ── GET media ───────────┼────────302 signed URL──────────►│   ← never touches the server
```

The server handles the report and the JSON. It never handles a recording, in either direction.

### The sharp edge this exposed

`report.html` addresses its media by **bare filename** — that is what makes a bundle folder, a `.zip`
and the app's own framed view all work from one `renderReport` call. Serve that page from a URL and
the bare name resolves against _that_ URL, where the recording is not.

`viewer/rewrite.ts` substitutes the one `src` attribute and reports whether it matched, so a markup
change degrades to a `<base>` fallback rather than a silently dead player. **The better fix is to
re-render server-side** using `ReportOptions.mediaSrc`, which `src/main/report.ts` already supports —
that requires sharing the renderer between app and server, which is a real coupling decision and is
therefore not taken in a prototype.

---

## Try it

```bash
cd server
cp .env.example .env            # the defaults use the local provider
set -a && . ./.env && set +a
npm start
```

It prints three bearer tokens, one per role, and a workspace id. Then push a bundle from the
desktop app's save folder:

```bash
node --experimental-strip-types - <<'EOF'
import { pushBundle } from './src/client/upload.ts'
console.log(await pushBundle({
  baseUrl: 'http://localhost:8787',
  token: '<the developer token>',
  workspaceId: '<the workspace id>',
  bundleDir: '/Users/you/Pictures/snapit/<a bundle folder>'
}))
EOF
```

A capture is private on arrival. An **admin** turns the link on:

```bash
curl -X POST -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"shared":true}' http://localhost:8787/v1/captures/<id>/share
```

Against a real bucket, change only the environment:

```bash
SNAPIT_STORAGE_PROVIDER=s3 SNAPIT_S3_BUCKET=… SNAPIT_S3_REGION=… \
SNAPIT_S3_ACCESS_KEY_ID=… SNAPIT_S3_SECRET_ACCESS_KEY=… npm start
# MinIO adds: SNAPIT_S3_ENDPOINT=http://localhost:9000 SNAPIT_S3_FORCE_PATH_STYLE=true
```

```bash
npm test         # 105 tests, 8 files
npm run typecheck
```

---

## API

| Method         | Path                                                 | Permission                               |
| -------------- | ---------------------------------------------------- | ---------------------------------------- |
| `GET`          | `/health`                                            | —                                        |
| `GET`          | `/v1/me`                                             | any token                                |
| `GET`/`POST`   | `/v1/workspaces/:id/members`                         | `member:read` / `member:manage`          |
| `DELETE`       | `/v1/workspaces/:id/members/:userId`                 | `member:manage`                          |
| `POST`         | `/v1/workspaces/:id/captures`                        | `capture:create`                         |
| `GET`          | `/v1/workspaces/:id/captures`                        | `capture:read`                           |
| `POST`         | `/v1/captures/:id/complete`                          | `capture:create`                         |
| `GET`/`DELETE` | `/v1/captures/:id`                                   | `capture:read` / `capture:delete`        |
| `POST`         | `/v1/captures/:id/share`                             | `capture:share` _(admin only)_           |
| `GET`/`POST`   | `/v1/workspaces/:id/integrations[/:kind]`            | `integration:use` / `integration:manage` |
| `POST`         | `/v1/captures/:id/integrations/:kind/preview`        | `integration:use`                        |
| `POST`         | `/v1/captures/:id/file`                              | `integration:use`                        |
| `GET`          | `/capture/:slug`, `/report`, `/media`, `/data/:name` | **none — the slug is the credential**    |

Every response is `{ ok, data }` or `{ ok, error: { code, message } }`.

### Roles

`rbac.ts` is the complete answer and is a table, not a tree of conditionals.

|                                        | viewer | developer | admin |
| -------------------------------------- | :----: | :-------: | :---: |
| read captures and members              |   ●    |     ●     |   ●   |
| create / delete captures               |        |     ●     |   ●   |
| file to Jira or Slack                  |        |     ●     |   ●   |
| **mint or revoke a public link**       |        |           |   ●   |
| manage members, integrations, settings |        |           |   ●   |

Sharing is admin-only on purpose: past that call, a recording of an environment that usually mirrors
production is reachable by anyone holding 26 characters.

---

## Verified boundaries

Each of these was run against the live server, not reasoned about:

- A slug that is not 26 Crockford characters never reaches the store.
- A `pending` capture, a revoked link and a slug that never existed are **one indistinguishable 404**,
  so the viewer is not an oracle for which captures exist.
- A revoked link cannot be re-minted; re-uploading is the only way back.
- A developer cannot share; a viewer cannot create.
- A token names its own workspace; a request for another one is 403, not a quiet redirect.
- `../../../../etc/passwd` as a filename is refused at the API and again in `storage/keys.ts`.
- `complete` HEADs every object and fails the capture when one is missing, so a half-upload never
  becomes a share link that renders a broken player.
- A tampered signature, an expired link, and a signed `GET` replayed as a `PUT` are all 403.

---

## Known gaps

1. **Auth is a placeholder.** HMAC tokens, seeded users, no sessions, no SSO, no revocation list.
2. **One process.** The JSON store loses writes if two servers share a file.
3. **No multipart upload.** A presigned single `PUT` covers snapit's recordings today; Azure caps at
   256 MiB and S3 at 5 GB, so a `createUpload()` returning a multipart plan is the first thing the
   `StorageProvider` interface will need. `storage/azure.ts` has the analysis.
4. **Neither integration has run against a live service.** The documents are tested; the two POSTs
   are not.
5. **No range requests from the local provider**, so seeking a long recording only works against a
   real bucket. Dev-only, and another reason `local` is labelled dev-only.
6. **Deleting a workspace or an org is not implemented** — only a capture. The key layout makes both
   prefix deletions.

## If this goes further

In rough order of what would actually block a pilot:

1. Replace `auth/tokens.ts` with OIDC; the `Actor` seam is already the only thing above it.
2. Replace `store/memory.ts` with Postgres behind the same `MetadataStore`.
3. Decide the renderer question: share `renderReport` between app and server, or keep the
   substitution in `viewer/rewrite.ts`. This is the one decision that touches the desktop app.
4. Run the S3 provider against a real bucket and a real MinIO, and add the CORS check preflight
   cannot do.
5. Then, and only then, wire `pushBundle` into `src/main/share.ts` as a fourth share shape.
