# Trying the connected-mode prototype

About ten minutes, using a real capture from your own save folder. Nothing here touches the
desktop app, writes to your save folder, or needs an AWS account.

**Prerequisites:** Node 22+ (`node --version`). No `npm install` — the prototype has no
dependencies of its own.

---

## 1. Prove it without running anything (20 seconds)

```bash
cd server
npm test
```

105 tests, 8 files. The two worth knowing about:

- `src/storage/tests/sigv4.spec.ts` pins the S3 request signer to the canonical-request
  hash AWS publishes, and to four signatures cross-checked against `aws4@1.13.2`.
- `src/viewer/tests/rewrite.spec.ts` asserts against the exact `<video>` markup
  `src/main/report.ts` emits. If the app's report changes shape, this is what fails.

---

## 2. Start the server

```bash
cd server
cp .env.example .env
set -a && . ./.env && set +a
npm start
```

You should see:

```
[snapit-server] storage "local" verified: write, read, delete
[snapit-server] listening on http://localhost:8787
[snapit-server] seeded workspace ws-…
[snapit-server]   admin     v1.…
[snapit-server]   developer v1.…
[snapit-server]   viewer    v1.…
```

The first line is the point: the server wrote a probe object, read it back and deleted it
**before** it opened a port. A misconfigured bucket stops the process here rather than
surfacing as a broken share link tomorrow. Try it — `SNAPIT_LOCAL_ROOT=/nope npm start`.

In a **second terminal**, copy the three tokens and the workspace id out of that output:

```bash
cd server
export WS=ws-…            # the seeded workspace id
export ADMIN=v1.…         # admin token
export DEV=v1.…           # developer token
export VIEWER=v1.…        # viewer token
export API=http://localhost:8787
```

> Seeded users exist only because a signup flow is not the point of the prototype. Tokens
> expire in 24h. See `src/seed.ts`.

---

## 3. Push a real capture

Pick a bundle folder from your save folder — any directory under `~/Pictures/snapit` that
contains a `report.html`:

```bash
export BUNDLE=$(ls -dt ~/Pictures/snapit/*/ | head -1) && echo "$BUNDLE"
```

Then push it with the desktop-side client:

```bash
node --experimental-strip-types - <<EOF
import { pushBundle } from './src/client/upload.ts'
console.log(await pushBundle({
  baseUrl: '$API', token: '$DEV', workspaceId: '$WS', bundleDir: '$BUNDLE',
  onProgress: (e) => console.log(\`  \${e.name} — \${e.done}/\${e.total} bytes\`)
}))
EOF
```

Watch what happens in three phases: the client declares its files, the server hands back one
presigned `PUT` per file, and the bytes go **straight to storage**. Save the ids it prints:

```bash
export CAP=cap-…          # captureId
export SLUG=…             # the last path segment of shareUrl
```

Look at the object layout it produced:

```bash
find .data/objects -type f ! -name '*.content-type' | sed 's|.*/captures/||'
```

Keys nest `orgs/…/workspaces/…/captures/…/{report,media,data}/…`, so a customer's own
lifecycle rule can expire a whole workspace by prefix.

---

## 4. The link does not work yet

```bash
curl -s -o /dev/null -w '%{http_code}\n' $API/capture/$SLUG
```

`404`. A capture is private on arrival — `visibility` is `workspace` until somebody turns
the link on. And a developer cannot turn it on:

```bash
curl -s -X POST -H "authorization: Bearer $DEV" -H 'content-type: application/json' \
  -d '{"shared":true}' $API/v1/captures/$CAP/share
```

> `This action needs "capture:share", which the developer role does not have.`

Sharing is admin-only because past that call, a recording of an environment that usually
mirrors production is reachable by anyone holding 26 characters.

---

## 5. Share it, and open it

```bash
curl -s -X POST -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"shared":true}' $API/v1/captures/$CAP/share
open $API/capture/$SLUG
```

**Play the recording.** That is the part worth watching, because of what had to happen for
it to work: `report.html` addresses its media by bare filename, which is correct inside a
bundle folder and wrong everywhere else. See what the server served:

```bash
curl -s $API/capture/$SLUG/report | grep -oE '<video[^>]*>|<base[^>]*>'
```

The `src` is now a signed, expiring URL pointing at storage — the recording never passes
through the server. `src/viewer/rewrite.ts` explains why this is a substitution and not a
re-render, and what the better fix would be.

---

## 6. The signed URL is not a skeleton key

```bash
export MEDIA=$(curl -s $API/capture/$SLUG/report \
  | grep -oE 'src="[^"]*_storage[^"]*"' | sed 's/^src="//;s/"$//;s/&amp;/\&/g')

curl -s "${MEDIA/signature=?/signature=f}"          # tampered
curl -s "$(echo "$MEDIA" | sed 's/expires=[0-9]*/expires=1700000000/')"   # expired
curl -s -X PUT --data 'overwritten' "$MEDIA"        # a GET link reused as a write
```

Three refusals. The third matters most: a signed URL carries the method it was signed for.

---

## 7. Roles, in three calls

```bash
# A viewer cannot create.
curl -s -X POST -H "authorization: Bearer $VIEWER" -H 'content-type: application/json' \
  -d '{"title":"x","files":[{"name":"report.html","role":"report","bytes":1,"contentType":"text/html"}]}' \
  $API/v1/workspaces/$WS/captures

# A token names its own workspace; asking for another is refused, not quietly redirected.
curl -s -H "authorization: Bearer $DEV" $API/v1/workspaces/ws-someone-elses/captures

# A filename that tries to escape its prefix.
curl -s -X POST -H "authorization: Bearer $DEV" -H 'content-type: application/json' \
  -d '{"title":"evil","files":[{"name":"../../../../etc/passwd","role":"data","bytes":1,"contentType":"text/plain"}]}' \
  $API/v1/workspaces/$WS/captures
```

---

## 8. See the Jira ticket and Slack post, without a Jira or a Slack

`preview` renders the document and sends nothing, so you can judge the output before wiring
any credential to it.

```bash
curl -s -X POST -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"settings":{"site":"bookingbug.atlassian.net","projectKey":"DEV","email":"you@example.com"},"secret":"not-a-real-token"}' \
  $API/v1/workspaces/$WS/integrations/jira

curl -s -X POST -H "authorization: Bearer $DEV" -H 'content-type: application/json' \
  -d '{"steps":["(0:04) Clicked Apply coupon","(0:07) Clicked Pay now"],
       "failedRequests":["POST 500 /api/v1/checkout — Internal Server Error"],
       "consoleErrors":["TypeError: cannot read total of undefined"]}' \
  $API/v1/captures/$CAP/integrations/jira/preview | python3 -m json.tool | head -40
```

Swap `jira` for `slack` on the preview URL to see the Block Kit version. Note what the Slack
message leaves out — no step list, no HAR. A channel post is an interruption; the detail is
one click away on purpose.

---

## 9. Revoke, and delete

```bash
curl -s -X POST -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"shared":false}' $API/v1/captures/$CAP/share
curl -s -o /dev/null -w 'link after revoke: %{http_code}\n' $API/capture/$SLUG

# Re-sharing will not reissue a URL that was already sent somewhere.
curl -s -X POST -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"shared":true}' $API/v1/captures/$CAP/share

# Delete removes the objects first, then the record.
curl -s -X DELETE -H "authorization: Bearer $DEV" $API/v1/captures/$CAP
find .data/objects -type f ! -name '*.content-type' | wc -l
```

---

## 10. Optional — against a real bucket

Everything above ran on the filesystem provider, which is dev-only: bytes pass through the
server and it cannot serve range requests, so a long recording will not seek. Nothing but
configuration changes to point at MinIO:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
# create a bucket named `snapit-captures` at http://localhost:9001

SNAPIT_STORAGE_PROVIDER=s3 SNAPIT_S3_BUCKET=snapit-captures SNAPIT_S3_REGION=us-east-1 \
SNAPIT_S3_ACCESS_KEY_ID=minioadmin SNAPIT_S3_SECRET_ACCESS_KEY=minioadmin \
SNAPIT_S3_ENDPOINT=http://localhost:9000 SNAPIT_S3_FORCE_PATH_STYLE=true \
SNAPIT_TOKEN_SECRET=a-prototype-secret-of-at-least-32-chars npm start
```

Then repeat from step 3. **This path has not been run against a live bucket yet** — the
signer is verified against AWS's published vectors and against `aws4`, which is not the same
as verified against a server. If it fails, that is the most useful thing this walkthrough
can produce.

---

## Then read, in this order

1. [`docs/ROADMAP.md`](../docs/ROADMAP.md) **Phase 3** — the decision: local-first, opt-in,
   on-prem, and snapit never operating storage. Start at M3.0, which is the refactor that
   comes before any of this.
2. [`server/README.md`](README.md) — what is built versus shaped, and M1.7's four costs
   re-priced.
3. [`docs/DESIGN.md`](../docs/DESIGN.md) **§0** — only if you want the reconciliation
   between the June 2026 design and what actually shipped.

**Remember the prototype is behind the decision it produced:** `src/domain/rbac.ts` still
implements `admin / developer / viewer`, while Phase 3 settles on `owner / admin / user`.
