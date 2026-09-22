import type { IncomingMessage, ServerResponse } from 'node:http'
import { renderViewerGone, renderViewerPage } from '../../viewer/page.ts'
import { renderSharedReport, resolveShared, sharedDataUrl, sharedMediaUrl } from '../../services/viewer.ts'
import type { CaptureDeps } from '../../services/captures.ts'

/**
 * The share link over HTTP: `https://snapit.example.com/capture/abc123`.
 *
 * Nothing here decides who may see what — `services/viewer.ts` does, and returns null for
 * every reason, so a `pending` capture, a revoked link and a slug that never existed are
 * one indistinguishable 404. This file turns that null into a page.
 *
 * Nothing is cacheable and nothing is indexable, because what sits behind the link is a
 * recording of an environment that usually mirrors production.
 */

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN'
} as const

const GONE = 'The link may have been revoked, or it may never have existed.'

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { ...HTML_HEADERS, 'content-length': Buffer.byteLength(html) })
  res.end(html)
}

const sendGone = (res: ServerResponse): void => sendHtml(res, 404, renderViewerGone(GONE))

/** A redirect, so the recording goes from storage to the browser and never through here. */
function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  res.end()
}

export async function viewCapture(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  slug: string
): Promise<void> {
  const capture = await resolveShared(deps, slug)
  if (!capture) return sendGone(res)

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

export async function viewReport(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  slug: string
): Promise<void> {
  const capture = await resolveShared(deps, slug)
  if (!capture) return sendGone(res)

  const rendered = await renderSharedReport(deps, capture, `${deps.publicUrl}/capture/${capture.shareSlug}/`)
  if (!rendered) return sendGone(res)
  if (capture.manifest.mediaName && !rendered.mediaRewritten) {
    console.warn(`[snapit-server] media src not found in report for ${capture.id}; relying on <base>.`)
  }
  sendHtml(res, 200, rendered.html)
}

export async function viewMedia(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  slug: string
): Promise<void> {
  const capture = await resolveShared(deps, slug)
  const url = capture ? await sharedMediaUrl(deps, capture) : null
  if (!url) return sendGone(res)
  redirect(res, url)
}

export async function viewData(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  slug: string,
  name: string
): Promise<void> {
  const capture = await resolveShared(deps, slug)
  const url = capture ? await sharedDataUrl(deps, capture, name) : null
  if (!url) return sendGone(res)
  redirect(res, url)
}
