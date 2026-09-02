/**
 * The addressing scheme the home window reads a capture through.
 *
 * The home window shows a capture by framing its report, which raises a question the
 * app has never had to answer before: a report is arbitrary text from somebody else's
 * application — console output, URLs, response headers, error bodies — and until now it
 * only ever opened in an external browser, in a tab with nothing of ours in it. Putting
 * it inside our own renderer puts it next to `window.snapit`.
 *
 * So it does not go inside our renderer. It goes in a frame with a document of its own,
 * on a scheme of its own, and this module is the part of that boundary with no electron
 * in it: what a URL may look like, what a request may ask for, and the policy each kind
 * of response is served under.
 *
 * Why a scheme rather than an `srcdoc` frame, which would have been less machinery: a
 * `srcdoc` document inherits the embedder's Content-Security-Policy, and the renderer's
 * is `script-src 'self'` with no `'unsafe-inline'`. The report's Network panel is an
 * inline script, so it would simply not run — and loosening the app's own policy to let
 * a page of foreign text execute is the wrong direction. A document loaded over a
 * scheme carries whatever policy its response says, which is how the report gets to
 * keep its script while the renderer keeps its own rules.
 */

/** Standard-scheme, so `capture.mp4` resolves against the report's own URL. */
export const CAPTURE_SCHEME = 'snapit-capture'

/** Rendered on request rather than read off disk. See `bundleReport.ts`. */
export const REPORT_FILE = 'report.html'

/**
 * A grant id: 32 lowercase hex characters, because it is the URL's host and a host is
 * the one part of a URL that cannot hold a path. Opaque on purpose — a bundle's path
 * never appears in a URL, so there is nothing in one to rewrite into a different path.
 */
const ID_PATTERN = /^[0-9a-f]{32}$/

export const isGrantId = (value: string): boolean => ID_PATTERN.test(value)

/** What the frame may ask for besides the report: the media the report plays or shows. */
const MEDIA_EXTENSIONS = new Set(['mp4', 'webm', 'gif', 'png'])

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
  png: 'image/png'
}

export const mediaTypeFor = (file: string): string | null =>
  MEDIA_TYPES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] ?? null

/**
 * One path segment naming a file, or null.
 *
 * Refuses rather than sanitises. Every URL the frame requests was written by a report
 * this process rendered a moment earlier, so a request for `../../settings.json` is not
 * an unusual request to be cleaned up — it means something else is asking, and the only
 * safe answer to that is no. Same reasoning as `resolveBundleDir` for bundle names
 * arriving from a model.
 */
export function captureFileName(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A malformed escape is not a filename.
    return null
  }
  if (!decoded.startsWith('/')) return null
  const name = decoded.slice(1)
  if (name.length === 0 || name.length > 255) return null
  // No separators of either kind, no traversal, no NUL, nothing hidden.
  if (/[/\\\0]/.test(name) || name.startsWith('.')) return null
  if (name === REPORT_FILE) return name
  return MEDIA_EXTENSIONS.has(name.slice(name.lastIndexOf('.') + 1).toLowerCase()) ? name : null
}

export type CaptureRequest = { id: string; file: string }

/** Split a request URL into the grant it names and the file it wants, or null. */
export function parseCaptureUrl(url: string): CaptureRequest | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${CAPTURE_SCHEME}:`) return null
  const id = parsed.hostname.toLowerCase()
  if (!isGrantId(id)) return null
  const file = captureFileName(parsed.pathname)
  return file === null ? null : { id, file }
}

export const captureUrl = (id: string, file: string): string =>
  `${CAPTURE_SCHEME}://${id}/${encodeURIComponent(file)}`

/**
 * The policy the report document is served under.
 *
 * Escaping is what stops foreign text becoming markup, and `escapeHtml` has always done
 * that; this is the layer that decides what an escaping bug would be worth. Under
 * `default-src 'none'` an injected script has nowhere to send anything — no
 * `connect-src`, so no fetch, no XHR, no WebSocket, no beacon — and no bridge to reach,
 * because the frame gets no preload and is sandboxed out of same-origin access to us.
 *
 * `script-src` and `style-src` are `'unsafe-inline'` because the report is one
 * self-contained file by rule: its styles and its one script are written into the page,
 * and they are ours. Named by scheme rather than `'self'` throughout — the frame is
 * sandboxed without `allow-same-origin`, so its origin is opaque and `'self'` would
 * match nothing, including the recording it is supposed to play.
 */
export const REPORT_CSP = [
  "default-src 'none'",
  `img-src ${CAPTURE_SCHEME}: data:`,
  `media-src ${CAPTURE_SCHEME}:`,
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ')

/** Media is bytes, and bytes execute nothing. Nothing needs to be allowed at all. */
export const MEDIA_CSP = "default-src 'none'"

/**
 * What the home window's detail should show for a capture.
 *
 * Decided in the main process because deciding needs the filesystem: whether a path is
 * a bundle folder or a loose file, and whether the folder's metadata can still be read.
 * A screenshot taken with ⌘⇧9 is a bare `.png` with no bundle around it, and there are
 * usually more of those in the save folder than anything else — so "there is no report"
 * is the ordinary case, not the broken one.
 */
export type CaptureView =
  | { kind: 'report'; url: string }
  | { kind: 'media'; url: string; media: 'video' | 'image' }

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm'])

/** A GIF is an image to a browser, whatever it is to a person. */
export const mediaKindFor = (file: string): 'video' | 'image' | null => {
  const type = mediaTypeFor(file)
  return type === null ? null : VIDEO_TYPES.has(type) ? 'video' : 'image'
}

export type ByteRange = { start: number; end: number }

/**
 * The byte range a media element is asking for, or null to serve the whole file.
 *
 * Seeking a video is entirely this. A player asks for the end of the file to find the
 * index, then for the region around wherever it was sent — so a handler that answers
 * every request with the whole file from byte zero produces a video that plays from the
 * start and cannot be moved. Measured: without this, setting `currentTime` to 56s in a
 * 57s recording left it at 0.
 *
 * Falls back to the whole file rather than a 416 for anything it cannot make sense of.
 * A malformed Range is a request nobody deliberately made, and the player recovers from
 * a 200 it did not expect far better than from an error.
 */
export function parseByteRange(header: string | null | undefined, size: number): ByteRange | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  // `bytes=-500` is the last 500 bytes, which is how a player finds an MP4's index
  // when the index is at the end.
  if (rawStart === '') {
    if (rawEnd === '') return null
    const length = Number(rawEnd)
    return length <= 0 ? null : { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(rawStart)
  if (start >= size) return null
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  return end < start ? null : { start, end }
}
