import type { IncomingMessage, ServerResponse } from 'node:http'
import { notFound } from '../http/respond.ts'
import { isShareSlug } from '../domain/ids.ts'
import { artifactKey } from '../storage/keys.ts'
import { renderViewerGone, renderViewerPage } from '../viewer/page.ts'
import { rewriteMediaSrc, withBase } from '../viewer/rewrite.ts'
import type { Capture } from '../domain/model.ts'
import type { MetadataStore } from '../store/metadata.ts'
import type { StorageProvider } from '../storage/provider.ts'

/**
 * The share link: `https://snapit.example.com/capture/abc123`.
 *
 * This is the one surface with no bearer token, which makes it the one surface where a
 * mistake is public. Three rules it keeps:
 *
 * 1. **The slug is the only credential, so it is checked before it is used.** A value
 *    that is not 26 Crockford characters never reaches the store.
 * 2. **Only `visibility: 'link'` and `status: 'ready'` are served.** Everything else is
 *    the same "not available" page — a `pending` capture, a revoked link and a slug that
 *    never existed are indistinguishable from outside, so the page is not an oracle for
 *    which captures exist.
 * 3. **Nothing here is cacheable and nothing is indexable.** `no-store` plus a robots
 *    meta, because ROADMAP M1.7's third cost is a QA environment's error bodies sitting
 *    at a URL longer than anyone intended.
 *
 * The media is served by redirecting to a short-lived signed URL, so the recording goes
 * from the customer's bucket to the viewer's browser and never through this process.
 */

/** Long enough to start playing a long recording, short enough that a copied URL dies. */
const MEDIA_URL_SECONDS = 900
const DATA_URL_SECONDS = 300

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  // The report is framed by this origin and nothing else.
  'x-frame-options': 'SAMEORIGIN'
} as const

export type ViewerDeps = { store: MetadataStore; storage: StorageProvider; publicUrl: string }

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { ...HTML_HEADERS, 'content-length': Buffer.byteLength(html) })
  res.end(html)
}

/**
 * Resolve a slug to a capture anyone may see, or null.
 *
 * Returning one null for every reason is deliberate — see rule 2 above.
 */
async function shared(deps: ViewerDeps, slug: string): Promise<Capture | null> {
  if (!isShareSlug(slug)) return null
  const capture = await deps.store.findCaptureBySlug(slug)
  if (!capture) return null
  if (capture.status !== 'ready') return null
  if (capture.visibility !== 'link' || capture.linkRevokedAt !== null) return null
  return capture
}

const keyFor = (capture: Capture, role: 'report' | 'media' | 'data', filename: string): string =>
  artifactKey({
    orgId: capture.orgId,
    workspaceId: capture.workspaceId,
    captureId: capture.id,
    role,
    filename
  })

const GONE = 'The link may have been revoked, or it may never have existed.'

/** `GET /capture/:slug` — the shell. */
export async function viewCapture(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: ViewerDeps,
  slug: string
): Promise<void> {
  const capture = await shared(deps, slug)
  if (!capture) {
    sendHtml(res, 404, renderViewerGone(GONE))
    return
  }
  const base = `${deps.publicUrl}/capture/${capture.shareSlug}`
  sendHtml(
    res,
    200,
    renderViewerPage({
      capture,
      manifest: capture.manifest,
      reportUrl: `${base}/report`,
      shareUrl: base,
      warning:
        capture.manifest.mediaName === null && capture.manifest.kind === 'recording'
          ? 'This capture was recorded, but its recording is not in storage. Everything else is here.'
          : undefined
    })
  )
}

/**
 * `GET /capture/:slug/report` — the bundle's own report, with its media re-pointed.
 *
 * The report is the one artifact this server does stream, and it is the right one to:
 * it is under a hundred kilobytes, it has to be modified in flight, and rewriting it
 * here is what keeps the recording out of this process. See `viewer/rewrite.ts` for why
 * the rewrite is a substitution and not a re-render.
 */
export async function viewReport(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: ViewerDeps,
  slug: string
): Promise<void> {
  const capture = await shared(deps, slug)
  if (!capture) {
    sendHtml(res, 404, renderViewerGone(GONE))
    return
  }
  const report = capture.manifest.artifacts.find((a) => a.role === 'report')
  if (!report) throw notFound('This capture has no report.')

  const stream = await deps.storage.get(keyFor(capture, 'report', report.name))
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  let html = Buffer.concat(chunks).toString('utf-8')

  const base = `${deps.publicUrl}/capture/${capture.shareSlug}/`
  html = withBase(html, base)

  const mediaName = capture.manifest.mediaName
  if (mediaName) {
    const signed = await deps.storage.signedUrl(keyFor(capture, 'media', mediaName), {
      expiresInSeconds: MEDIA_URL_SECONDS
    })
    const result = rewriteMediaSrc(html, mediaName, signed.url)
    // A miss means the report's markup changed shape. Falling back to the `<base>` above
    // keeps the player pointed at `/capture/:slug/media`, which still works — rather than
    // serving a page whose video silently 404s.
    html = result.rewritten ? result.html : html
    if (!result.rewritten) {
      console.warn(`[snapit-server] media src not found in report for ${capture.id}; relying on <base>.`)
    }
  }

  sendHtml(res, 200, html)
}

/** `GET /capture/:slug/media` — a redirect, so the bytes never come through here. */
export async function viewMedia(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: ViewerDeps,
  slug: string
): Promise<void> {
  const capture = await shared(deps, slug)
  const mediaName = capture?.manifest.mediaName
  if (!capture || !mediaName) {
    sendHtml(res, 404, renderViewerGone(GONE))
    return
  }
  const signed = await deps.storage.signedUrl(keyFor(capture, 'media', mediaName), {
    expiresInSeconds: MEDIA_URL_SECONDS
  })
  res.writeHead(302, { location: signed.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  res.end()
}

/** `GET /capture/:slug/data/:name` — the HAR, the console, the action trail. */
export async function viewData(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: ViewerDeps,
  slug: string,
  name: string
): Promise<void> {
  const capture = await shared(deps, slug)
  const artifact = capture?.manifest.artifacts.find((a) => a.role === 'data' && a.name === name)
  if (!capture || !artifact) {
    sendHtml(res, 404, renderViewerGone(GONE))
    return
  }
  const signed = await deps.storage.signedUrl(keyFor(capture, 'data', artifact.name), {
    expiresInSeconds: DATA_URL_SECONDS,
    downloadAs: artifact.name
  })
  res.writeHead(302, { location: signed.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  res.end()
}
