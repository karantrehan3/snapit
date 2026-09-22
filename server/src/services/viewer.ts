import { isShareSlug } from '../domain/ids.ts'
import { artifactKey } from '../storage/keys.ts'
import { rewriteMediaSrc, withBase } from '../viewer/rewrite.ts'
import type { Capture } from '../domain/model.ts'
import type { CaptureDeps } from './captures.ts'

/**
 * Resolving a share link, without any notion of a request.
 *
 * The one surface with no bearer token, which makes it the one where a mistake is public.
 * Three rules, and they are enforced here rather than in a route so an in-process caller
 * gets exactly the same answers:
 *
 * 1. The slug is the only credential, so it is checked before it is used.
 * 2. Only `visibility: 'link'` and `status: 'ready'` resolve. A `pending` capture, a revoked
 *    link and a slug that never existed are one indistinguishable `null` — the viewer must
 *    not be an oracle for which captures exist.
 * 3. The media is never read through here. Callers get a signed URL and redirect to it.
 */

/** Long enough to start playing a long recording, short enough that a copied URL dies. */
export const MEDIA_URL_SECONDS = 900
export const DATA_URL_SECONDS = 300

export const keyFor = (capture: Capture, role: 'report' | 'media' | 'data', filename: string): string =>
  artifactKey({
    orgId: capture.orgId,
    workspaceId: capture.workspaceId,
    captureId: capture.id,
    role,
    filename
  })

/** The capture a slug names, if anyone at all may see it. */
export async function resolveShared(deps: CaptureDeps, slug: string): Promise<Capture | null> {
  if (!isShareSlug(slug)) return null
  const capture = await deps.store.findCaptureBySlug(slug)
  if (!capture) return null
  if (capture.status !== 'ready') return null
  if (capture.visibility !== 'link' || capture.linkRevokedAt !== null) return null
  return capture
}

export type RenderedReport = { html: string; mediaRewritten: boolean }

/**
 * The bundle's own `report.html`, with its media re-pointed at storage.
 *
 * The report is the one artifact worth reading through the process that serves it: it is
 * under a hundred kilobytes and it has to be modified in flight. Everything else is a
 * redirect. See `viewer/rewrite.ts` for why this is a substitution and not a re-render.
 */
export async function renderSharedReport(
  deps: CaptureDeps,
  capture: Capture,
  baseUrl: string
): Promise<RenderedReport | null> {
  const report = capture.manifest.artifacts.find((a) => a.role === 'report')
  if (!report) return null

  const stream = await deps.storage.get(keyFor(capture, 'report', report.name))
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  let html = withBase(Buffer.concat(chunks).toString('utf-8'), baseUrl)

  const mediaName = capture.manifest.mediaName
  if (!mediaName) return { html, mediaRewritten: false }

  const signed = await deps.storage.signedUrl(keyFor(capture, 'media', mediaName), {
    expiresInSeconds: MEDIA_URL_SECONDS
  })
  const result = rewriteMediaSrc(html, mediaName, signed.url)
  // A miss means the report's markup changed shape. The `<base>` above keeps the player
  // pointed somewhere that still works, rather than serving a page whose video 404s.
  if (result.rewritten) html = result.html
  return { html, mediaRewritten: result.rewritten }
}

/** A short-lived URL for the recording. Null when this capture has none. */
export async function sharedMediaUrl(deps: CaptureDeps, capture: Capture): Promise<string | null> {
  const mediaName = capture.manifest.mediaName
  if (!mediaName) return null
  const signed = await deps.storage.signedUrl(keyFor(capture, 'media', mediaName), {
    expiresInSeconds: MEDIA_URL_SECONDS
  })
  return signed.url
}

/** A download URL for one of the sibling files — the HAR, the console, the action trail. */
export async function sharedDataUrl(
  deps: CaptureDeps,
  capture: Capture,
  name: string
): Promise<string | null> {
  const artifact = capture.manifest.artifacts.find((a) => a.role === 'data' && a.name === name)
  if (!artifact) return null
  const signed = await deps.storage.signedUrl(keyFor(capture, 'data', artifact.name), {
    expiresInSeconds: DATA_URL_SECONDS,
    downloadAs: artifact.name
  })
  return signed.url
}
