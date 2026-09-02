import type { LibraryKind } from './libraryEntry'

/**
 * What every capture together says, which no single capture can.
 *
 * snapit holds every session a person has run against an app. DevTools holds the one
 * currently open. So the thing snapit can answer and DevTools cannot is not "what
 * happened here" — the report does that — but **"is this the same failure again"**. An
 * endpoint that 500s in one capture is a bug; the same endpoint failing in six captures
 * across three weeks is a different and more useful fact, and it is sitting unread in
 * the save folder.
 *
 * ## Local, and structurally so
 *
 * Everything here is derived from files on this machine and nothing leaves it. That is
 * not a promise in a comment: this module is pure. It takes facts and returns numbers,
 * has no fs and no electron, and cannot reach the network because it imports nothing
 * that can. If opt-in telemetry is ever wanted it would be a separate module consuming
 * this one's output, with its own setting and its own visible log of what it sends —
 * `ROADMAP.md` has the position it would have to argue with.
 *
 * ## Why the normalisation is the whole trick
 *
 * `/api/v5/company/37002/services` and `/api/v5/company/41883/services` are one endpoint
 * failing twice, not two endpoints failing once. Without collapsing the volatile parts of
 * a path every row is unique, every count is 1, and the page says nothing. That
 * collapsing is a guess, so it is conservative — see `normalizeEndpoint`.
 */

/** One request, reduced to what an aggregate needs. */
export type RequestFact = {
  method: string
  /** Absolute URL as captured. Normalised on the way into an aggregate. */
  url: string
  status: number
  durationMs: number
}

/** One capture, reduced to what an aggregate needs. `session.ts` does the reading. */
export type CaptureFacts = {
  name: string
  /** ISO. */
  capturedAt: string
  kind: LibraryKind
  bytes: number
  consoleErrors: number
  /** Present only for captures that collected a HAR. */
  requests: RequestFact[]
}

const DAY_MS = 86_400_000

/** Midnight local time — the boundary people mean by "a day", not 24 hours ago. */
const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** A segment that is an id rather than a name, so two paths that differ only there are one. */
const VOLATILE = [
  { test: /^\d+$/, as: '{id}' },
  { test: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, as: '{uuid}' },
  { test: /^[0-9a-fA-F]{24,}$/, as: '{hash}' },
  { test: /^\d{4}-\d{2}-\d{2}$/, as: '{date}' },
  // Mixed letters and digits with at least two digits: `a1b2c3`, `MEDIC-2233` stays.
  { test: /^(?=(?:[^\d]*\d){2,})[A-Za-z0-9_]{8,}$/, as: '{token}' }
]

/**
 * `POST /api/v5/company/{id}/services` — the endpoint, not the request.
 *
 * Only path segments are collapsed, and only ones that look like identifiers rather than
 * names. The query string goes entirely: it is where cache-busters and filters live, and
 * keeping it would split one endpoint into as many rows as it had callers.
 *
 * Deliberately conservative. Over-collapsing merges two real endpoints into one row and
 * reports a failure count for something that does not exist, which is worse than showing
 * two rows for one endpoint — that at least is still true.
 */
export function normalizeEndpoint(method: string, url: string): string {
  let path: string
  let host = ''
  try {
    const parsed = new URL(url)
    path = parsed.pathname
    host = parsed.host
  } catch {
    // Not a parseable URL. Use it whole rather than dropping the request.
    path = url.split('?')[0]
  }
  const collapsed = path
    .split('/')
    .map((seg) => VOLATILE.find((v) => v.test.test(seg))?.as ?? seg)
    .join('/')
  const verb = method.toUpperCase() || 'GET'
  return host ? `${verb} ${host}${collapsed}` : `${verb} ${collapsed}`
}

/** A failing status, including 0 — a request that never got a response. Mirrors `har.ts`. */
const isFailed = (status: number): boolean => status === 0 || status >= 400

/**
 * The p-th percentile by nearest rank, which is the honest method for small samples.
 *
 * A QA session makes a handful of calls to any one endpoint, so interpolating between
 * two of six measurements invents precision that is not there. Nearest rank returns a
 * duration that was actually observed.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))]
}

export type FailingEndpoint = {
  endpoint: string
  /** How many requests to it failed, across every capture. */
  failures: number
  /** How many separate captures it failed in. This is the number that matters. */
  captures: number
  /** Distinct statuses seen, worst first. */
  statuses: number[]
  /** When it last failed. ISO. */
  lastSeen: string
}

export type SlowEndpoint = {
  endpoint: string
  samples: number
  p95Ms: number
  medianMs: number
}

export type DayBucket = { /** ISO date, local. */ day: string; captures: number; errors: number }

export type Analytics = {
  captures: number
  withFindings: number
  bytes: number
  consoleErrors: number
  requests: number
  failedRequests: number
  /** Null when there are no captures. */
  firstCapturedAt: string | null
  lastCapturedAt: string | null
  byKind: Record<LibraryKind, number>
  /** Failed in more than one capture first, because that is a pattern rather than an event. */
  failingEndpoints: FailingEndpoint[]
  slowest: SlowEndpoint[]
  days: DayBucket[]
}

export type AnalyticsOptions = {
  /** How many days of buckets to produce, including today. */
  days?: number
  /** How many rows each table keeps. */
  limit?: number
  /** Fewest observations before an endpoint may appear in `slowest`. */
  minSamples?: number
}

const EMPTY_KINDS: Record<LibraryKind, number> = { screenshot: 0, recording: 0, session: 0 }

/**
 * Reduce every capture to one page of numbers.
 *
 * `now` is a parameter so the day buckets are testable and so "today" means the reader's
 * today rather than whenever the process started.
 */
export function summarise(
  facts: readonly CaptureFacts[],
  now: Date = new Date(),
  opts: AnalyticsOptions = {}
): Analytics {
  const { days = 30, limit = 8, minSamples = 3 } = opts

  const out: Analytics = {
    captures: facts.length,
    withFindings: 0,
    bytes: 0,
    consoleErrors: 0,
    requests: 0,
    failedRequests: 0,
    firstCapturedAt: null,
    lastCapturedAt: null,
    byKind: { ...EMPTY_KINDS },
    failingEndpoints: [],
    slowest: [],
    days: []
  }

  // endpoint -> failures, and the set of captures it failed in.
  const failing = new Map<
    string,
    { failures: number; captures: Set<string>; statuses: Set<number>; last: number }
  >()
  const durations = new Map<string, number[]>()
  const perDay = new Map<string, { captures: number; errors: number }>()

  const today = startOfDay(now)
  const oldest = today - (days - 1) * DAY_MS

  for (const capture of facts) {
    const at = Date.parse(capture.capturedAt)
    out.bytes += Math.max(0, capture.bytes)
    out.consoleErrors += Math.max(0, capture.consoleErrors)
    out.byKind[capture.kind] = (out.byKind[capture.kind] ?? 0) + 1

    if (!Number.isNaN(at)) {
      if (out.firstCapturedAt === null || at < Date.parse(out.firstCapturedAt)) {
        out.firstCapturedAt = capture.capturedAt
      }
      if (out.lastCapturedAt === null || at > Date.parse(out.lastCapturedAt)) {
        out.lastCapturedAt = capture.capturedAt
      }
      const day = startOfDay(new Date(at))
      if (day >= oldest && day <= today) {
        const key = isoDay(day)
        const bucket = perDay.get(key) ?? { captures: 0, errors: 0 }
        bucket.captures++
        bucket.errors += Math.max(0, capture.consoleErrors)
        perDay.set(key, bucket)
      }
    }

    let failedHere = 0
    for (const req of capture.requests) {
      out.requests++
      const endpoint = normalizeEndpoint(req.method, req.url)
      if (req.durationMs > 0) {
        const seen = durations.get(endpoint)
        if (seen) seen.push(req.durationMs)
        else durations.set(endpoint, [req.durationMs])
      }
      if (!isFailed(req.status)) continue
      out.failedRequests++
      failedHere++
      const entry = failing.get(endpoint) ?? {
        failures: 0,
        captures: new Set<string>(),
        statuses: new Set<number>(),
        last: 0
      }
      entry.failures++
      entry.captures.add(capture.name)
      entry.statuses.add(req.status)
      if (!Number.isNaN(at)) entry.last = Math.max(entry.last, at)
      failing.set(endpoint, entry)
    }
    if (failedHere > 0 || capture.consoleErrors > 0) out.withFindings++
  }

  out.failingEndpoints = [...failing.entries()]
    .map(([endpoint, v]) => ({
      endpoint,
      failures: v.failures,
      captures: v.captures.size,
      // Worst first: a 500 matters more than a 404, and a 0 never got a response at all.
      statuses: [...v.statuses].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : b - a)),
      lastSeen: v.last > 0 ? new Date(v.last).toISOString() : ''
    }))
    // Recurrence first, then volume, then name so two equal rows never swap between reads.
    .sort(
      (a, b) => b.captures - a.captures || b.failures - a.failures || a.endpoint.localeCompare(b.endpoint)
    )
    .slice(0, limit)

  out.slowest = [...durations.entries()]
    .filter(([, v]) => v.length >= minSamples)
    .map(([endpoint, v]) => ({
      endpoint,
      samples: v.length,
      p95Ms: Math.round(percentile(v, 95)),
      medianMs: Math.round(percentile(v, 50))
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms || a.endpoint.localeCompare(b.endpoint))
    .slice(0, limit)

  // Every day in the window, including the empty ones — a gap in a chart is information
  // and a missing bar is not the same shape as a zero one.
  out.days = Array.from({ length: days }, (_, i) => {
    const day = isoDay(oldest + i * DAY_MS)
    const bucket = perDay.get(day)
    return { day, captures: bucket?.captures ?? 0, errors: bucket?.errors ?? 0 }
  })

  return out
}

/** Local calendar date, not UTC — a capture at 1am belongs to the day it felt like. */
function isoDay(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
