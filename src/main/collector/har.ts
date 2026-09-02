import type { Entry } from 'har-format'
import { num } from '../untrusted'

/**
 * Everything the rest of snapit needs to agree on about a HAR: its shape, what counts as
 * a failure, and the post-processing chrome-har's output needs before it is written.
 *
 * The vocabulary lives here because four modules were each carrying their own idea of it
 * — a hand-rolled `HarEntry` apiece, and three separate spellings of `status === 0 ||
 * status >= 400`. Read paths diverging on what "failed" means is the kind of bug nobody
 * finds: the report, the agent and the body-fetcher would simply disagree about which
 * requests mattered.
 *
 * The post-processing itself is response bodies, plus trimming away the setup phase.
 * `chrome-har` reconstructs a HAR from CDP events, but the events never carry a body —
 * that needs a separate `Network.getResponseBody` call per request. Which is why it is
 * rationed: see `wantsBody` and `bodyFitsBudget` below for what earns one and why.
 *
 * Pure, so the caps and the merge are testable without a browser.
 */

/** HAR 1.2 itself, from `@types/har-format`, re-exported so there is one import for it. */
export type { Entry, Har, Header, Request, Response, Timings } from 'har-format'

/**
 * What chrome-har adds that the spec does not describe. `_resourceType` and
 * `_transferSize` are in `har-format` already; the request id it correlates bodies by
 * is not.
 */
export type ChromeEntry = Entry & { _requestId?: string }

/**
 * A HAR as it comes off disk: shaped like one, trusted like a stranger.
 *
 * Deliberately not `Har`. That type describes a valid document, and a file read back
 * from the save folder may have been truncated by a crash, hand-edited, or written by a
 * version of snapit that did not exist yet. Every field is optional and `unknown` so a
 * reader has to coerce rather than assume — the same reasoning as `libraryEntry.ts`,
 * where a capture that exists must still be listed however bad its metadata is.
 */
export type LooseEntry = {
  startedDateTime?: unknown
  time?: unknown
  timings?: {
    blocked?: unknown
    dns?: unknown
    connect?: unknown
    ssl?: unknown
    send?: unknown
    wait?: unknown
    receive?: unknown
  }
  serverIPAddress?: unknown
  _resourceType?: unknown
  _initiator?: unknown
  _initiator_type?: unknown
  _priority?: unknown
  request?: {
    method?: unknown
    url?: unknown
    headers?: unknown
    httpVersion?: unknown
    postData?: { mimeType?: unknown; text?: unknown; params?: unknown }
  }
  response?: {
    status?: unknown
    statusText?: unknown
    headers?: unknown
    httpVersion?: unknown
    content?: { text?: unknown; size?: unknown; mimeType?: unknown }
    _transferSize?: unknown
  }
}

/** The response status of an entry read off disk, or undefined when there is not one. */
export const statusOf = (entry: LooseEntry): number | undefined => num(entry.response?.status)

/** Pull the entries out of a file that claims to be a HAR, or nothing if it is not. */
export function looseEntries(har: unknown): LooseEntry[] {
  const entries = (har as HarLike)?.log?.entries
  return Array.isArray(entries) ? (entries as LooseEntry[]) : []
}

/**
 * A HAR-shaped document, as the transforms below take it.
 *
 * Looser than `Har` on purpose, and not the same loosening as `LooseEntry`: these run
 * over what chrome-har has just built in memory, but that can be a document with no
 * entries at all when Chrome died mid-session, and the generic exists so whatever else
 * is hanging off it survives the transform untouched.
 */
export type HarLike = { log?: { entries?: unknown } }

/** Enough for an error payload or a stack trace, short of an HTML page dumped whole. */
export const MAX_BODY_CHARS = 20_000
/** A chatty single-page app makes a few hundred calls; past this the save would stall. */
export const MAX_BODIES = 300
/**
 * How large a successful response may be before its body stops being worth a round trip.
 *
 * Measured across seven real captures: of 89 MB of response bodies, 78 MB is JavaScript
 * and 4 MB is images — neither of which anybody opens a bug report to read. Excluding
 * them by resource type leaves 3.2 MB, and this cap takes that to 237 KB while still
 * keeping 212 of 222 bodies. What it drops is an i18n bundle fetched three times and a
 * search-results page; what it keeps is every API call anyone would ask about.
 */
export const MAX_BODY_BYTES = 32 * 1024

/**
 * Resource types whose body is worth having. The same line Jam draws — bodies for the
 * programmatic calls, nothing for static assets — and for the same reason: a page's
 * scripts and images are its bulk and never its bug.
 */
const BODY_RESOURCE_TYPES = new Set(['xhr', 'fetch'])

/**
 * Whether to ask Chrome for this response's body at all.
 *
 * Failures qualify whatever they are: a 500 serving an HTML error page is the reason the
 * capture exists. Everything else has to be a call the application made on purpose.
 */
export const wantsBody = (resourceType: string | undefined, status: number | undefined): boolean =>
  isFailedStatus(status) || BODY_RESOURCE_TYPES.has((resourceType ?? '').toLowerCase())

/**
 * Whether it is small enough to be worth fetching, now that its size is known.
 *
 * Failures are exempt — they are rare, and one of them is the point of the capture.
 * `MAX_BODY_CHARS` still truncates whatever comes back, so an enormous error page costs
 * one round trip rather than an enormous bundle.
 */
export const bodyFitsBudget = (bytes: number | undefined, status: number | undefined): boolean =>
  isFailedStatus(status) || typeof bytes !== 'number' || bytes <= MAX_BODY_BYTES

export type ResponseBody = { text: string; base64Encoded: boolean }

/**
 * A failing status, including 0 — a request that never got a response at all.
 *
 * The one definition. The report colours rows by it, the MCP tools filter by it, and the
 * collector decides whose response body to fetch by it; those three must not drift.
 */
export const isFailedStatus = (status: number | undefined): boolean =>
  typeof status === 'number' && (status === 0 || status >= 400)

/**
 * Drop requests that happened before the capture began.
 *
 * Done here rather than by clearing the CDP event buffer, which was the obvious
 * approach and is wrong: chrome-har maps each request to a page using the frame
 * lifecycle events that came before it, so throwing those away makes every later
 * request unmappable and it silently drops them. The event stream stays whole; the
 * built HAR is filtered instead.
 */
export function trimHarBefore<T extends HarLike>(har: T, cutoffMs: number): T {
  const entries = har?.log?.entries as (Entry | undefined)[] | undefined
  if (!Array.isArray(entries)) return har
  return {
    ...har,
    log: {
      ...har.log,
      entries: entries.filter((entry) => {
        const started = entry?.startedDateTime ? Date.parse(entry.startedDateTime) : NaN
        // An entry with no usable timestamp is kept: dropping evidence because its
        // clock is unreadable is worse than leaving one stale request in.
        return Number.isNaN(started) || started >= cutoffMs
      })
    }
  }
}

/**
 * Merge fetched bodies into the HAR by request id.
 *
 * Binary bodies are dropped rather than stored: a base64 blob of a failed image tells a
 * reader nothing and would dominate the file it sits in.
 */
export function attachResponseBodies<T extends HarLike>(har: T, bodies: Record<string, ResponseBody>): T {
  const entries = har?.log?.entries as ChromeEntry[] | undefined
  if (!Array.isArray(entries)) return har
  return {
    ...har,
    log: {
      ...har.log,
      entries: entries.map((entry) => {
        const id = entry._requestId
        const body = id ? bodies[id] : undefined
        if (!body || body.base64Encoded) return entry
        const text =
          body.text.length > MAX_BODY_CHARS ? `${body.text.slice(0, MAX_BODY_CHARS)}...` : body.text
        return {
          ...entry,
          response: {
            ...entry.response,
            content: { ...entry.response?.content, text }
          }
        }
      })
    }
  }
}
