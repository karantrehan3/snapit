import { describe, it, expect } from 'vitest'
import {
  MAX_BODY_BYTES,
  MAX_BODY_CHARS,
  attachResponseBodies,
  bodyFitsBudget,
  isFailedStatus,
  trimHarBefore,
  wantsBody
} from '../har'

describe('isFailedStatus', () => {
  it('treats 4xx and 5xx as failures', () => {
    expect(isFailedStatus(404)).toBe(true)
    expect(isFailedStatus(500)).toBe(true)
  })

  it('treats a request that never got a response as a failure', () => {
    expect(isFailedStatus(0)).toBe(true)
  })

  it('leaves successes and redirects alone', () => {
    expect(isFailedStatus(200)).toBe(false)
    expect(isFailedStatus(302)).toBe(false)
    expect(isFailedStatus(undefined)).toBe(false)
  })
})

describe('attachResponseBodies', () => {
  const har = {
    log: {
      entries: [
        { _requestId: 'a', response: { status: 500, content: { mimeType: 'application/json' } } },
        { _requestId: 'b', response: { status: 200, content: { mimeType: 'text/html' } } },
        { _requestId: 'c', response: { status: 404, content: { mimeType: 'image/png' } } }
      ]
    }
  }

  it('attaches a body to the entry it belongs to, by request id', () => {
    const out = attachResponseBodies(har, { a: { text: '{"error":"kaboom"}', base64Encoded: false } })
    expect(out.log.entries[0].response.content.text).toBe('{"error":"kaboom"}')
  })

  it('leaves entries with no fetched body untouched', () => {
    const out = attachResponseBodies(har, { a: { text: 'x', base64Encoded: false } })
    expect(out.log.entries[1].response.content.text).toBeUndefined()
  })

  it('drops a binary body rather than storing a base64 blob nobody can read', () => {
    const out = attachResponseBodies(har, { c: { text: 'iVBORw0KGgo=', base64Encoded: true } })
    expect(out.log.entries[2].response.content.text).toBeUndefined()
  })

  it('caps an enormous body so one HTML error page cannot dominate the file', () => {
    const out = attachResponseBodies(har, {
      a: { text: 'x'.repeat(MAX_BODY_CHARS * 3), base64Encoded: false }
    })
    const text = out.log.entries[0].response.content.text as string
    expect(text.length).toBeLessThan(MAX_BODY_CHARS + 10)
    expect(text.endsWith('...')).toBe(true)
  })

  it('keeps the rest of the entry, including what chrome-har worked out', () => {
    const out = attachResponseBodies(har, { a: { text: 'boom', base64Encoded: false } })
    expect(out.log.entries[0].response.status).toBe(500)
    expect(out.log.entries[0].response.content.mimeType).toBe('application/json')
  })

  it('does not mutate the HAR it was given', () => {
    attachResponseBodies(har, { a: { text: 'boom', base64Encoded: false } })
    expect(har.log.entries[0].response.content).not.toHaveProperty('text')
  })

  it('survives a malformed or empty HAR', () => {
    expect(attachResponseBodies({ log: { entries: [] } }, {})).toEqual({ log: { entries: [] } })
    expect(attachResponseBodies({}, {})).toEqual({})
  })
})

describe('trimHarBefore', () => {
  const at = (iso: string, url: string): Record<string, unknown> => ({
    startedDateTime: iso,
    request: { url },
    response: { status: 200 }
  })
  const cutoff = Date.parse('2026-08-25T10:00:00.000Z')
  const har = {
    log: {
      entries: [
        at('2026-08-25T09:59:00.000Z', '/login'),
        at('2026-08-25T09:59:30.000Z', '/auth/token'),
        at('2026-08-25T10:00:00.000Z', '/app'),
        at('2026-08-25T10:00:05.000Z', '/api/orders')
      ]
    }
  }

  it('drops what happened during setup', () => {
    const urls = trimHarBefore(har, cutoff).log.entries.map((e) => e.request.url)
    expect(urls).toEqual(['/app', '/api/orders'])
  })

  it('keeps a request that began exactly at the cutoff', () => {
    expect(trimHarBefore(har, cutoff).log.entries.some((e) => e.request.url === '/app')).toBe(true)
  })

  it('keeps everything when the capture began at launch', () => {
    expect(trimHarBefore(har, 0).log.entries).toHaveLength(4)
  })

  it('keeps an entry whose timestamp cannot be read', () => {
    // Losing evidence because a clock is unreadable is worse than one stale request.
    const odd = { log: { entries: [{ request: { url: '/x' } }, { startedDateTime: 'nonsense' }] } }
    expect(trimHarBefore(odd, cutoff).log.entries).toHaveLength(2)
  })

  it('does not mutate the HAR it was given', () => {
    trimHarBefore(har, cutoff)
    expect(har.log.entries).toHaveLength(4)
  })

  it('survives a malformed HAR', () => {
    expect(trimHarBefore({}, cutoff)).toEqual({})
    expect(trimHarBefore({ log: { entries: [] } }, cutoff).log.entries).toEqual([])
  })
})

describe('wantsBody', () => {
  it('keeps the calls an application makes on purpose', () => {
    expect(wantsBody('XHR', 200)).toBe(true)
    expect(wantsBody('Fetch', 200)).toBe(true)
  })

  it('skips the static assets that are most of the bytes and none of the bug', () => {
    // Measured across seven real captures: 78 MB of the 89 MB of bodies is JavaScript.
    expect(wantsBody('Script', 200)).toBe(false)
    expect(wantsBody('Image', 200)).toBe(false)
    expect(wantsBody('Stylesheet', 200)).toBe(false)
    expect(wantsBody('Font', 200)).toBe(false)
  })

  it('keeps a failure whatever kind of thing it was', () => {
    // A 500 serving an HTML error page is the reason the capture exists.
    expect(wantsBody('Document', 500)).toBe(true)
    expect(wantsBody('Image', 404)).toBe(true)
    expect(wantsBody('Other', 0)).toBe(true)
  })

  it('reads the type case-insensitively, since CDP and HAR disagree on it', () => {
    expect(wantsBody('xhr', 200)).toBe(true)
    expect(wantsBody(undefined, 200)).toBe(false)
  })
})

describe('bodyFitsBudget', () => {
  it('takes anything under the cap', () => {
    expect(bodyFitsBudget(1024, 200)).toBe(true)
    expect(bodyFitsBudget(MAX_BODY_BYTES, 200)).toBe(true)
  })

  it('refuses a successful response over it', () => {
    expect(bodyFitsBudget(MAX_BODY_BYTES + 1, 200)).toBe(false)
  })

  it('exempts failures, which are rare and are the point', () => {
    expect(bodyFitsBudget(5_000_000, 500)).toBe(true)
    expect(bodyFitsBudget(5_000_000, 0)).toBe(true)
  })

  it('fetches when the size is unknown rather than guessing it is huge', () => {
    expect(bodyFitsBudget(undefined, 200)).toBe(true)
  })
})
