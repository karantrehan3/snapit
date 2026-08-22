/**
 * Response bodies for the requests that failed.
 *
 * `chrome-har` reconstructs a HAR from CDP events, but the events never carry a body —
 * that needs a separate `Network.getResponseBody` call per request. Which is why this
 * only happens for failures: the body of a 500 is usually the reason the capture exists,
 * and the body of every successful request is megabytes of noise.
 *
 * Pure, so the caps and the merge are testable without a browser.
 */

/** Enough for an error payload or a stack trace, short of an HTML page dumped whole. */
export const MAX_BODY_CHARS = 20_000
/** A page can fail hundreds of times; fetching every body would stall the save. */
export const MAX_BODIES = 50

export type ResponseBody = { text: string; base64Encoded: boolean }

/** A failing status, including 0 — a request that never got a response at all. */
export const isFailedStatus = (status: number | undefined): boolean =>
  typeof status === 'number' && (status === 0 || status >= 400)

type HarEntry = {
  _requestId?: string
  response?: { content?: { text?: string; size?: number; mimeType?: string } }
}

type Har = { log?: { entries?: HarEntry[] } }

/**
 * Merge fetched bodies into the HAR by request id.
 *
 * Binary bodies are dropped rather than stored: a base64 blob of a failed image tells a
 * reader nothing and would dominate the file it sits in.
 */
export function attachResponseBodies<T extends Har>(har: T, bodies: Record<string, ResponseBody>): T {
  const entries = har?.log?.entries
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
