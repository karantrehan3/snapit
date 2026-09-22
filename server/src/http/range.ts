/**
 * Parsing a `Range` header.
 *
 * This exists because of a crash. A `<video>` element does not download a recording and
 * stop — it opens a request, buffers, and aborts the moment you seek or leave the page,
 * and it does that repeatedly. Without range support the browser has to ask for all 41 MB
 * to play the first second, so the abort is not an edge case, it is the normal path.
 *
 * Pure, because every value here came from a header.
 */

export type ByteRange = {
  /** Inclusive, as HTTP means it. */
  start: number
  end: number
}

export type RangeResult =
  /** No `Range` header, or one this server does not honour — send the whole thing. */
  | { kind: 'full' }
  | { kind: 'partial'; range: ByteRange }
  /** The range is well-formed and outside the object: RFC 9110 says 416. */
  | { kind: 'unsatisfiable' }

/**
 * Only `bytes`, and only a single range.
 *
 * A multipart response for several ranges needs a boundary-delimited body, and nothing
 * asks for one — browsers request one range at a time. Declining is explicitly allowed,
 * and the correct way to decline is to send the whole representation, not an error.
 */
export function parseByteRange(header: string | string[] | undefined, size: number): RangeResult {
  const value = Array.isArray(header) ? header[0] : header
  if (!value || size <= 0) return { kind: 'full' }

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return { kind: 'full' }

  const [, rawStart, rawEnd] = match as unknown as [string, string, string]
  if (rawStart === '' && rawEnd === '') return { kind: 'full' }

  // `bytes=-500` means the *last* 500 bytes, not "from 0 to 500". Getting this backwards
  // serves the beginning of a video to something asking for the end of it.
  if (rawStart === '') {
    const wanted = Number(rawEnd)
    if (!Number.isFinite(wanted) || wanted <= 0) return { kind: 'full' }
    return { kind: 'partial', range: { start: Math.max(0, size - wanted), end: size - 1 } }
  }

  const start = Number(rawStart)
  if (!Number.isFinite(start) || start >= size) return { kind: 'unsatisfiable' }

  // An open-ended range runs to the last byte, which is what `bytes=0-` asks for and is
  // what Chrome sends first for a video.
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (!Number.isFinite(end) || end < start) return { kind: 'unsatisfiable' }

  return { kind: 'partial', range: { start, end } }
}

export const rangeLength = (range: ByteRange): number => range.end - range.start + 1

export const contentRange = (range: ByteRange, size: number): string =>
  `bytes ${range.start}-${range.end}/${size}`

/**
 * Whether a failure is just the client hanging up.
 *
 * A browser aborting a media request is not an error and must not be logged as one, let
 * alone answered with a response — the headers went out long ago. These are the codes
 * Node uses for it.
 */
const DISCONNECT_CODES = new Set([
  'ERR_STREAM_PREMATURE_CLOSE',
  'ECONNRESET',
  'EPIPE',
  'ERR_STREAM_DESTROYED'
])

export function isClientDisconnect(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && DISCONNECT_CODES.has(code)
}
