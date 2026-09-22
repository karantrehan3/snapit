# snapit server — connected mode prototype

A prototype of what snapit would need to let a **second person** see a capture: workspaces,
roles, and a share link — on a server the customer runs, against storage the customer owns.

**The desktop app is untouched.** Nothing in `src/` imports anything here, the Electron
build does not reference this directory, and `npm test` at the repo root neither runs these
tests nor can be broken by them. This package has no dependencies of its own.

---

## Quickstart

Two commands, no configuration, no AWS account.

```bash
cd server
npm start                 # terminal 1
```

```bash
cd server
npm run push              # terminal 2
```

`npm run push` finds your newest capture in `~/Pictures/snapit`, uploads it, turns the share
link on, prints the URL and opens it. To push a specific one:

```bash
npm run push -- "~/Pictures/snapit/Wait Time Demo"
```

That is the whole happy path. Everything below is optional.

<details>
<summary><strong>If something goes wrong</strong></summary>

| What you see                          | What it means                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `No development secret yet`           | The server has not run yet. `npm start` in another terminal, then retry.                    |
| `The server has not been started yet` | Same — the server creates `.data/` on first boot.                                           |
| `No capture bundles in …`             | You have no browser-session bundles. Record one in snapit, or pass a folder as an argument. |
| `Upload failed … fetch`               | The server is not listening. Check terminal 1.                                              |
| `EADDRINUSE`                          | Port 8787 is taken. `SNAPIT_PORT=9000 SNAPIT_PUBLIC_URL=http://localhost:9000 npm start`.   |
| Video will not seek                   | Expected. The filesystem provider cannot serve range requests — see _Storage_ below.        |

Start over at any time: delete `server/.data/` and run `npm start` again. It holds
everything — the objects, the metadata and the development secret — and nothing else.

</details>

---

## Where this runs

Three configurations, and it is worth being precise about which is a product mode and which
is just development.

|                  | Server                                         | Storage                         | Share links                                            | What it is                                                                                                 |
| ---------------- | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Local only**   | none                                           | your save folder                | none — you share a file                                | **The product today.** No login, no network. `ROADMAP.md` Phase 3 commits to keeping this the default.     |
| **Local server** | `localhost`                                    | `server/.data/`                 | `http://localhost:8787/…` — **only you can open them** | **Development.** What the quickstart runs. Not a mode to ship: a link nobody else can open is not a share. |
| **On-prem**      | the customer's EC2, EKS, or a box under a desk | the customer's S3 / Azure / GCS | real, inside their perimeter                           | **The team mode.** What Phase 3 is for.                                                                    |

So "running everything locally" is how you _develop_ this, and "local only" — no server at
all — is how the product ships by default. The server is only worth standing up when more
than one person needs the capture, and that is the case where it belongs on shared
infrastructure rather than a laptop.

```
Local only                    On-prem (a team)
──────────                    ────────────────
snapit desktop                snapit desktop
   └── save folder               └── snapit server   ← the customer's EC2 / EKS
                                       ├── auth · roles · metadata
                                       └── StorageProvider
                                             └── the customer's S3 / Azure / GCS
```

snapit never operates any of it. No hosted tier, no snapit-owned bucket, no free-trial
storage — see `ROADMAP.md` _Scope discipline_.

---

## The number that shaped the architecture

A snapit recording is routinely 150 MB and a long one is 560 MB. Nothing that size goes
through the server, in either direction:

```
Desktop                     Server                      Customer's bucket
   │                           │                                │
   ├── POST …/captures ───────►│  records a `pending` capture   │
   │◄── presigned PUT × n ─────┤  mints one URL per file        │
   │                           │                                │
   ├───────────── PUT bytes ───┼───────────────────────────────►│   ← never touches the server
   │                           │                                │
   ├── POST …/complete ───────►│  HEADs every object, then      │
   │◄── shareUrl ──────────────┤  builds the manifest           │
                               │                                │
Viewer ── GET /capture/:slug ─►│  shell page                    │
       ── GET …/report ───────►│  ~100 KB, media src rewritten  │
       ── GET media ───────────┼────────302 signed URL─────────►│   ← never touches the server
```

`complete` re-checks every object against storage before marking a capture ready. Without
that, a failed upload becomes a share link that renders a broken player to whoever it was
sent to.

---

## What is built, and what is only shaped

| Area                             | State                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageProvider` abstraction    | **Built.** Nothing above it knows which cloud it got.                                                                                                   |
| Local filesystem provider        | **Built**, development only.                                                                                                                            |
| S3 / MinIO / R2 / Ceph           | **Built.** SigV4 verified against AWS's published canonical-request hash and differentially against `aws4@1.13.2`. **Never run against a live bucket.** |
| Azure Blob, GCS                  | **Shaped.** Each fails at boot naming what it needs. GCS works today via the S3 endpoint — see `src/storage/gcs.ts`.                                    |
| Two-phase direct upload          | **Built and exercised** on a real 41 MB capture.                                                                                                        |
| Org / workspace / members        | **Built.**                                                                                                                                              |
| Roles                            | **Built** — but as `admin / developer / viewer`. Phase 3 settles on `owner / admin / user`; this has not caught up.                                     |
| Share link + viewer + revocation | **Built and exercised.**                                                                                                                                |
| Jira / Slack                     | **Document builders built and tested. Neither POST has run against a live service.**                                                                    |
| Auth                             | **Placeholder.** HMAC tokens where OIDC belongs.                                                                                                        |
| Metadata store                   | **Placeholder.** A JSON file behind a `MetadataStore` interface. One process only.                                                                      |

---

## Poking at it

Once the quickstart is running. `$SLUG` is the last segment of the URL it printed.

```bash
eval $(npm run --silent token)     # sets API, WS and TOKEN for an admin
export SLUG=<the last segment of the URL push printed>
```

`npm run token developer` and `npm run token viewer` issue the other two roles, which is the
quickest way to watch the permission table in `src/domain/rbac.ts` actually bite:

```bash
eval $(npm run --silent token viewer)
curl -s -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"x","files":[{"name":"report.html","role":"report","bytes":1,"contentType":"text/html"}]}' \
  $API/v1/workspaces/$WS/captures
# → This action needs "capture:create", which the viewer role does not have.
```

**The media is served from storage, not from here.** `report.html` addresses its media by
bare filename — correct inside a bundle folder, wrong everywhere else — so the server
rewrites that one attribute to a signed, expiring URL:

```bash
curl -s $API/capture/$SLUG/report | grep -oE '<video[^>]*>'
```

**A signed URL is not a skeleton key.** All three of these are refused:

```bash
export MEDIA=$(curl -s $API/capture/$SLUG/report \
  | grep -oE 'src="[^"]*_storage[^"]*"' | sed 's/^src="//;s/"$//;s/&amp;/\&/g')

curl -s "${MEDIA/signature=?/signature=f}"                                # tampered
curl -s "$(echo "$MEDIA" | sed 's/expires=[0-9]*/expires=1700000000/')"   # expired
curl -s -X PUT --data 'overwritten' "$MEDIA"                              # GET reused as a write
```

**See the Jira ticket and Slack post without a Jira or a Slack.** `preview` renders the
document and sends nothing, so you can judge the output before wiring a credential to it:

```bash
curl -s -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"settings":{"site":"example.atlassian.net","projectKey":"DEV","email":"you@example.com"},"secret":"not-real"}' \
  $API/v1/workspaces/$WS/integrations/jira

curl -s -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"steps":["(0:04) Clicked Apply coupon"],"failedRequests":["POST 500 /api/v1/checkout"]}' \
  $API/v1/captures/<capture id>/integrations/jira/preview | python3 -m json.tool
```

Swap `jira` for `slack` to see the Block Kit version, and note what it leaves out — no step
list, no HAR. A channel post is an interruption; the detail is one click away on purpose.

---

## Against a real bucket

Only configuration changes. MinIO, locally:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
# create a bucket named `snapit-captures` at http://localhost:9001, then:

SNAPIT_STORAGE_PROVIDER=s3 SNAPIT_S3_BUCKET=snapit-captures SNAPIT_S3_REGION=us-east-1 \
SNAPIT_S3_ACCESS_KEY_ID=minioadmin SNAPIT_S3_SECRET_ACCESS_KEY=minioadmin \
SNAPIT_S3_ENDPOINT=http://localhost:9000 SNAPIT_S3_FORCE_PATH_STYLE=true \
SNAPIT_TOKEN_SECRET=a-secret-of-at-least-32-characters npm start
```

Note the last variable. A real provider will **not** invent a token secret the way the local
one does — there the secret guards somebody else's bucket. See `src/devSecret.ts`.

`.env.example` lists every variable, including Azure and GCS.

---

## Storage

The abstraction is `put · get · head · delete · list · signedUrl`, and three rules that are
not negotiable:

1. **Bytes never pass through the server.** See the diagram above.
2. **A misconfigured bucket stops the server, not a viewer.** `preflight()` writes, reads
   back and deletes a probe object before the port opens. Try it: `SNAPIT_LOCAL_ROOT=/nope
npm start`.
3. **The filesystem provider is for development.** It is the one provider where bytes do
   transit the server, and it cannot serve range requests — so a long recording will not
   seek. That is the single clearest reason not to run this configuration for a team.

---

## API

Every response is `{ ok, data }` or `{ ok, error: { code, message } }`.

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
| `POST`         | `/v1/captures/:id/share`                             | `capture:share` — admin only             |
| `GET`/`POST`   | `/v1/workspaces/:id/integrations[/:kind]`            | `integration:use` / `integration:manage` |
| `POST`         | `/v1/captures/:id/integrations/:kind/preview`        | `integration:use`                        |
| `POST`         | `/v1/captures/:id/file`                              | `integration:use`                        |
| `GET`          | `/capture/:slug`, `/report`, `/media`, `/data/:name` | **none — the slug is the credential**    |

Sharing is admin-only because past that call, a recording of an environment that usually
mirrors production is reachable by anyone holding 26 characters.

---

## Verified boundaries

Run against the live server, not reasoned about:

- A slug that is not 26 Crockford characters never reaches the store.
- A `pending` capture, a revoked link and a slug that never existed are **one
  indistinguishable 404** — the viewer is not an oracle for which captures exist.
- A revoked link cannot be re-minted; re-uploading is the only way back.
- A developer cannot share; a viewer cannot create.
- A token names its own workspace; asking for another is 403, not a quiet redirect.
- `../../../../etc/passwd` as a filename is refused at the API and again in `storage/keys.ts`.
- `complete` fails the capture when an object is missing.
- A tampered signature, an expired link, and a signed `GET` replayed as a `PUT` are all 403.

```bash
npm test          # 105 tests, 8 files
npm run typecheck
```

---

## Known gaps

1. **Auth is a placeholder** — HMAC tokens, seeded users, no SSO, no revocation list.
2. **One process** — the JSON store loses writes if two servers share a file.
3. **No multipart upload.** A single presigned `PUT` covers snapit's recordings today; Azure
   caps at 256 MiB and S3 at 5 GB. `src/storage/azure.ts` has the analysis.
4. **Neither integration has run against a live service.**
5. **No range requests from the local provider**, so seeking only works against a real bucket.
6. **Deleting a workspace or an org is not implemented** — only a capture. The key layout
   makes both prefix deletions.
7. **Roles here are `admin / developer / viewer`**, while Phase 3 settles on
   `owner / admin / user`.

## Read next

1. [`docs/ROADMAP.md`](../docs/ROADMAP.md) **Phase 3** — the decision this prototype
   produced. Start at **M3.0**, a `CaptureStore` / `Identity` refactor in the desktop app
   that comes before any of this is adopted.
2. [`docs/DESIGN.md`](../docs/DESIGN.md) **§0** — how the June 2026 design maps onto what
   actually shipped.
