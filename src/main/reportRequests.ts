import { isFailedStatus, looseEntries, statusOf, type LooseEntry } from './collector/har'
import { REDACTED } from './collector/redact'
import { clip, num, str } from './untrusted'

/**
 * Reading a HAR into the report's network section.
 *
 * Separate from `mcp/summarise.ts`, which reads the same file for a different reader. An
 * agent pays for every line it is handed, so that one keeps failures only and clips hard.
 * A person scrolling a report is looking for the request that did not happen, the one
 * that took four seconds, or the redirect that went somewhere unexpected — none of which
 * survive a filter on `status >= 400`. So this keeps every entry and lets the page hide
 * the quiet ones.
 *
 * Pure, so the clock conversion, the phase arithmetic and the header filtering are
 * testable without a browser or a disk.
 */

export type HeaderPair = { name: string; value: string }

/**
 * A request's time, in the three parts worth seeing at the width a report column has.
 *
 * Chrome's Network panel splits it seven ways, which needs the whole width of a browser
 * window to read. These three are what a person actually diagnoses from: it sat in a
 * queue, the server thought about it, or it was simply large. `ssl` is deliberately not
 * added — HAR defines it as already counted inside `connect`, so summing both would
 * inflate every HTTPS request.
 */
export type RequestPhases = { beforeMs: number; waitMs: number; receiveMs: number }

/** Every phase HAR records, for the panel's Timing tab. -1 means it was not measured. */
export type RequestTimings = {
  blocked: number
  dns: number
  connect: number
  ssl: number
  send: number
  wait: number
  receive: number
}

/**
 * The filter chips along the top of a Network panel. Chrome's own grouping, because a
 * reader who knows that panel already knows what "Fetch/XHR" excludes.
 */
export type ResourceGroup = 'xhr' | 'js' | 'css' | 'img' | 'media' | 'font' | 'doc' | 'ws' | 'other'

const GROUPS: Record<string, ResourceGroup> = {
  xhr: 'xhr',
  fetch: 'xhr',
  script: 'js',
  stylesheet: 'css',
  image: 'img',
  media: 'media',
  font: 'font',
  document: 'doc',
  websocket: 'ws'
}

export const resourceGroup = (resourceType: string | undefined): ResourceGroup =>
  GROUPS[(resourceType ?? '').toLowerCase()] ?? 'other'

/** What was sent, already through `redactHar` — a form body or a JSON payload. */
export type RequestPayload = { mimeType?: string; text?: string; params: HeaderPair[] }

export type ReportRequest = {
  /**
   * Milliseconds from the capture's origin, or null when the entry carried no readable
   * timestamp — a request with no place on the timeline must not claim to be at zero.
   */
  atMs: number | null
  method: string
  status: number
  url: string
  statusText?: string
  /** `xhr`, `document`, `script`… — what kind of thing this was, per Chrome. */
  resourceType?: string
  mimeType?: string
  /** Bytes over the wire, when the HAR recorded them. */
  bytes?: number
  durationMs?: number
  /** Absent when the HAR measured no phase at all, which a cache hit often does not. */
  phases?: RequestPhases
  /** Every phase, unrounded and including the unmeasured ones, for the Timing tab. */
  timings?: RequestTimings
  /** Last path segment, the way a Network panel's Name column reads. */
  name: string
  /** Host, shown under the name — two requests to `/config.json` are rarely the same one. */
  domain: string
  group: ResourceGroup
  /** URL of the script or document that caused this, when Chrome could say. */
  initiator?: string
  initiatorType?: string
  priority?: string
  httpVersion?: string
  serverIp?: string
  payload?: RequestPayload
  /** The start of the response body, for the entries that earned one; see `collector/har.ts`. */
  body?: string
  requestHeaders: HeaderPair[]
  responseHeaders: HeaderPair[]
  /** How many headers were dropped because redaction had already emptied them. */
  redactedHeaders: number
}

/** Enough to see the content type, the cache directives and the CORS story. */
export const MAX_HEADERS = 30
/**
 * A body is here to identify the response, not to read it — a failure's message, or the
 * shape of the payload an API returned. The HAR beside it holds the whole thing.
 */
const MAX_BODY_CHARS = 600
const MAX_URL_CHARS = 500

/**
 * One phase, in whole milliseconds. A phase the HAR did not measure is reported as -1,
 * which is not a duration; and chrome-har's microsecond precision is noise both in
 * `549.05 ms waiting` and in a bar seven pixels tall.
 */
const phase = (value: unknown): number => Math.round(Math.max(0, num(value) ?? 0))

/**
 * Drop the headers redaction has already emptied, fold away exact repeats, and say how
 * many were removed.
 *
 * Two things make a raw HAR's header list unreadable. `authorization: [redacted by
 * snapit]` is a row of no information, and there are usually several — the count is kept
 * instead, because "these headers exist and snapit removed them" is worth knowing where
 * silently showing eleven of fourteen would read as the whole set. And chrome-har
 * reconstructs each list from two CDP events, so almost every header arrives twice under
 * different capitalisation, which used to fill the thirty-row cap with duplicates before
 * `access-control-allow-origin` got a chance.
 *
 * Only exact repeats are folded — same name, same value. Two headers of the same name
 * with different values is a real thing that happens and is exactly what someone reading
 * this would be looking for.
 */
export function usefulHeaders(raw: unknown): { headers: HeaderPair[]; redacted: number } {
  if (!Array.isArray(raw)) return { headers: [], redacted: 0 }
  const seen = new Set<string>()
  let redacted = 0
  const headers: HeaderPair[] = []
  for (const item of raw as { name?: unknown; value?: unknown }[]) {
    const name = str(item?.name)
    const value = str(item?.value)
    if (!name) continue
    const key = `${name.toLowerCase()} ${value}`
    if (seen.has(key)) continue
    seen.add(key)
    if (value === REDACTED) {
      redacted++
      continue
    }
    if (headers.length < MAX_HEADERS) headers.push({ name, value })
  }
  return { headers, redacted }
}

/** Where this request sits on the capture's clock, or null when it cannot be placed. */
export function requestAtMs(startedDateTime: unknown, originMs: number): number | null {
  // An unreadable origin makes every offset unreadable. Saying so beats arithmetic on
  // NaN, which reaches the page as a timestamp reading "NaN:NaN".
  if (!Number.isFinite(originMs)) return null
  if (typeof startedDateTime !== 'string') return null
  const started = Date.parse(startedDateTime)
  if (Number.isNaN(started)) return null
  // A request from just before the origin is a boundary artefact, not a negative time.
  return Math.max(0, started - originMs)
}

/** Every phase as recorded, unrounded, or nothing when the HAR has no timings block. */
export function fullTimings(timings: LooseEntry['timings']): RequestTimings | undefined {
  if (!timings || typeof timings !== 'object') return undefined
  const read = (value: unknown): number => num(value) ?? -1
  return {
    blocked: read(timings.blocked),
    dns: read(timings.dns),
    connect: read(timings.connect),
    ssl: read(timings.ssl),
    send: read(timings.send),
    wait: read(timings.wait),
    receive: read(timings.receive)
  }
}

/**
 * The Name and Domain columns.
 *
 * A Network panel shows the last path segment, because forty rows of the same origin are
 * unreadable otherwise — and falls back to the host for a bare `/`, which is what a page
 * load looks like.
 */
export function requestName(url: string): { name: string; domain: string } {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    return { name: (last ?? parsed.hostname) + parsed.search, domain: parsed.hostname }
  } catch {
    // data:, blob: and anything malformed. The whole thing is the best name available.
    return { name: clip(url, 80), domain: '' }
  }
}

/** What was sent with the request, already redacted by `redactHar`. */
export function requestPayload(postData: unknown): RequestPayload | undefined {
  if (!postData || typeof postData !== 'object') return undefined
  const mimeType = str((postData as { mimeType?: unknown }).mimeType)
  const text = str((postData as { text?: unknown }).text)
  const raw = (postData as { params?: unknown }).params
  const params = Array.isArray(raw)
    ? (raw as { name?: unknown; value?: unknown }[])
        .filter((pair) => str(pair?.name))
        .slice(0, MAX_HEADERS)
        .map((pair) => ({ name: str(pair.name), value: str(pair.value) }))
    : []
  if (!mimeType && !text && params.length === 0) return undefined
  return { ...(mimeType ? { mimeType } : {}), ...(text ? { text: clip(text, MAX_BODY_CHARS) } : {}), params }
}

/** The three phases, or nothing when the HAR measured none of them. */
export function requestPhases(timings: LooseEntry['timings']): RequestPhases | undefined {
  if (!timings || typeof timings !== 'object') return undefined
  const phases = {
    beforeMs: phase(timings.blocked) + phase(timings.dns) + phase(timings.connect) + phase(timings.send),
    waitMs: phase(timings.wait),
    receiveMs: phase(timings.receive)
  }
  return phases.beforeMs + phases.waitMs + phases.receiveMs > 0 ? phases : undefined
}

/**
 * Every request in the HAR, on the capture's clock, in the order they were made.
 *
 * `originMs` is the wall clock the rest of the bundle counts from — `meta.capturedAt`.
 * Console lines and actions are already relative to it, so converting here is what lets
 * a request sit on the same timeline as the error it caused.
 */
export function reportRequests(har: unknown, originMs: number): ReportRequest[] {
  const requests = looseEntries(har).map((entry): ReportRequest => {
    const res = entry.response
    const request = usefulHeaders(entry.request?.headers)
    const response = usefulHeaders(res?.headers)
    const statusText = str(res?.statusText)
    const resourceType = str(entry._resourceType)
    const mimeType = str(res?.content?.mimeType).split(';')[0]
    const bytes = num(res?._transferSize) ?? num(res?.content?.size)
    const total = num(entry.time)
    const body = str(res?.content?.text).replace(/\s+/g, ' ').trim()
    const phases = requestPhases(entry.timings)
    const timings = fullTimings(entry.timings)
    const url = clip(str(entry.request?.url), MAX_URL_CHARS)
    const initiator = str(entry._initiator)
    const initiatorType = str(entry._initiator_type)
    const priority = str(entry._priority)
    const httpVersion = str(res?.httpVersion) || str(entry.request?.httpVersion)
    const serverIp = str(entry.serverIPAddress)
    const payload = requestPayload(entry.request?.postData)
    return {
      atMs: requestAtMs(entry.startedDateTime, originMs),
      method: str(entry.request?.method, 'GET'),
      status: statusOf(entry) ?? 0,
      url,
      ...requestName(url),
      group: resourceGroup(resourceType),
      ...(statusText ? { statusText } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(bytes !== undefined && bytes >= 0 ? { bytes } : {}),
      ...(total !== undefined && total >= 0 ? { durationMs: Math.round(total) } : {}),
      ...(phases ? { phases } : {}),
      ...(timings ? { timings } : {}),
      ...(initiator ? { initiator: clip(initiator, MAX_URL_CHARS) } : {}),
      ...(initiatorType ? { initiatorType } : {}),
      ...(priority ? { priority } : {}),
      ...(httpVersion ? { httpVersion } : {}),
      ...(serverIp ? { serverIp } : {}),
      ...(payload ? { payload } : {}),
      ...(body ? { body: clip(body, MAX_BODY_CHARS) } : {}),
      requestHeaders: request.headers,
      responseHeaders: response.headers,
      redactedHeaders: request.redacted + response.redacted
    }
  })

  // Chronological, so the list reads beside the video the way the console does. Entries
  // with no timestamp go last rather than to zero — they are the ones we know least about,
  // and subtracting two infinities to sort them among themselves yields NaN.
  return requests.sort((a, b) => {
    if (a.atMs === null) return b.atMs === null ? 0 : 1
    return b.atMs === null ? -1 : a.atMs - b.atMs
  })
}

/**
 * The `limit` requests most worth showing, still in the order they happened.
 *
 * Truncating chronologically would drop the 500 at the end of a busy session, which is
 * the one entry the report exists for. Failures are kept first and the earliest
 * successes fill whatever is left, then the result is put back in order — the selection
 * is by importance, the reading is by time.
 *
 * The limit is the renderer's to pass, because it is a question about how much fits on a
 * page. It used to be a constant here kept equal to one in `report.ts` by comment, which
 * is the weakest kind of coupling there is.
 */
export function keepMostTelling(requests: readonly ReportRequest[], limit: number): ReportRequest[] {
  if (requests.length <= limit) return [...requests]
  const failures = requests.filter((r) => isFailedStatus(r.status))
  const rest = requests.filter((r) => !isFailedStatus(r.status))
  const kept = new Set([...failures.slice(0, limit), ...rest.slice(0, Math.max(0, limit - failures.length))])
  return requests.filter((r) => kept.has(r))
}
