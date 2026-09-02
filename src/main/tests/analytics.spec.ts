import { describe, expect, it } from 'vitest'
import { normalizeEndpoint, percentile, summarise, type CaptureFacts, type RequestFact } from '../analytics'

const req = (over: Partial<RequestFact> = {}): RequestFact => ({
  method: 'GET',
  url: 'https://studio.jrni.dev/api/v5/basket',
  status: 200,
  durationMs: 100,
  ...over
})

const capture = (over: Partial<CaptureFacts> = {}): CaptureFacts => ({
  name: 'snapit-2026-09-02_15-40-49',
  capturedAt: '2026-09-02T15:40:49.000Z',
  kind: 'session',
  bytes: 1_000_000,
  consoleErrors: 0,
  requests: [],
  ...over
})

describe('normalizeEndpoint', () => {
  it('collapses numeric ids so one endpoint is one row', () => {
    // The whole point: these are one endpoint failing twice, not two failing once.
    const a = normalizeEndpoint('GET', 'https://x.dev/api/v5/company/37002/services')
    const b = normalizeEndpoint('GET', 'https://x.dev/api/v5/company/41883/services')
    expect(a).toBe(b)
    expect(a).toBe('GET x.dev/api/v5/company/{id}/services')
  })

  it('collapses uuids, long hashes and dates', () => {
    expect(normalizeEndpoint('GET', 'https://x.dev/b/3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toContain(
      '{uuid}'
    )
    expect(normalizeEndpoint('GET', 'https://x.dev/o/a1b2c3d4e5f6a1b2c3d4e5f6')).toContain('{hash}')
    expect(normalizeEndpoint('GET', 'https://x.dev/day/2026-08-31/slots')).toContain('{date}')
  })

  it('drops the query string, where cache-busters live', () => {
    const a = normalizeEndpoint('GET', 'https://x.dev/api/v5/services?_=1725291649')
    const b = normalizeEndpoint('GET', 'https://x.dev/api/v5/services?_=1725291822')
    expect(a).toBe(b)
    expect(a).not.toContain('?')
  })

  it('keeps segments that are names, not identifiers', () => {
    // Over-collapsing invents an endpoint that does not exist, which is worse than
    // showing two rows for one that does.
    const e = normalizeEndpoint('POST', 'https://x.dev/api/v5/appointments/checkin')
    expect(e).toBe('POST x.dev/api/v5/appointments/checkin')
    expect(normalizeEndpoint('GET', 'https://x.dev/MEDIC-2233/report')).toContain('MEDIC-2233')
  })

  it('distinguishes methods on one path', () => {
    const path = 'https://x.dev/api/v5/appointments'
    expect(normalizeEndpoint('GET', path)).not.toBe(normalizeEndpoint('POST', path))
  })

  it('keeps an unparseable url rather than dropping the request', () => {
    expect(normalizeEndpoint('get', 'not a url?x=1')).toBe('GET not a url')
  })
})

describe('percentile', () => {
  it('returns a value that was actually observed', () => {
    // Nearest rank, not interpolation: a handful of samples cannot support invented
    // precision, and a duration nobody measured is not a useful thing to report.
    const v = [90, 100, 110, 120, 2400]
    expect(v).toContain(percentile(v, 95))
    expect(percentile(v, 95)).toBe(2400)
    expect(percentile(v, 50)).toBe(110)
  })

  it('handles one sample and none', () => {
    expect(percentile([42], 95)).toBe(42)
    expect(percentile([], 95)).toBe(0)
  })
})

describe('summarise', () => {
  const now = new Date('2026-09-02T18:00:00.000Z')

  it('reports nothing for nothing, without inventing a range', () => {
    const a = summarise([], now)
    expect(a.captures).toBe(0)
    expect(a.firstCapturedAt).toBeNull()
    expect(a.failingEndpoints).toEqual([])
    // Still one bucket per day, so an empty chart has a shape.
    expect(a.days).toHaveLength(30)
    expect(a.days.every((d) => d.captures === 0)).toBe(true)
  })

  it('ranks an endpoint that failed in several captures above a louder one-off', () => {
    const recurring = 'https://x.dev/api/v5/company/1/services'
    const oneOff = 'https://x.dev/api/v5/basket'
    const facts = [
      capture({ name: 'a', requests: [req({ url: recurring, status: 500 })] }),
      capture({
        name: 'b',
        requests: [req({ url: 'https://x.dev/api/v5/company/2/services', status: 503 })]
      }),
      capture({
        name: 'c',
        requests: Array.from({ length: 9 }, () => req({ url: oneOff, status: 404 }))
      })
    ]
    const a = summarise(facts, now)
    expect(a.failingEndpoints[0].endpoint).toBe('GET x.dev/api/v5/company/{id}/services')
    expect(a.failingEndpoints[0].captures).toBe(2)
    // The nine-failure one-off is still listed, just second.
    expect(a.failingEndpoints[1].failures).toBe(9)
    expect(a.failingEndpoints[1].captures).toBe(1)
  })

  it('orders statuses worst first, with a dead request ahead of everything', () => {
    const url = 'https://x.dev/api/v5/slots'
    const a = summarise(
      [
        capture({ requests: [req({ url, status: 404 }), req({ url, status: 500 }), req({ url, status: 0 })] })
      ],
      now
    )
    expect(a.failingEndpoints[0].statuses).toEqual([0, 500, 404])
  })

  it('counts a request that never got a response as failed', () => {
    const a = summarise([capture({ requests: [req({ status: 0 })] })], now)
    expect(a.failedRequests).toBe(1)
  })

  it('needs several observations before calling an endpoint slow', () => {
    const slow = 'https://x.dev/api/v5/services'
    const once = 'https://x.dev/api/v5/one'
    const a = summarise(
      [
        capture({
          requests: [
            req({ url: slow, durationMs: 2400 }),
            req({ url: slow, durationMs: 2200 }),
            req({ url: slow, durationMs: 2300 }),
            req({ url: once, durationMs: 9000 })
          ]
        })
      ],
      now
    )
    // One 9-second measurement is an anecdote and must not top the table.
    expect(a.slowest.map((s) => s.endpoint)).not.toContain('GET x.dev/api/v5/one')
    expect(a.slowest[0].endpoint).toBe('GET x.dev/api/v5/services')
    expect(a.slowest[0].samples).toBe(3)
    expect(a.slowest[0].p95Ms).toBe(2400)
  })

  it('buckets by local calendar day and fills the gaps', () => {
    const a = summarise(
      [
        capture({ capturedAt: new Date('2026-09-02T09:00:00').toISOString(), consoleErrors: 7 }),
        capture({ capturedAt: new Date('2026-09-02T22:00:00').toISOString(), consoleErrors: 2 }),
        capture({ capturedAt: new Date('2026-08-31T12:00:00').toISOString(), consoleErrors: 6 })
      ],
      new Date('2026-09-02T23:30:00'),
      { days: 5 }
    )
    expect(a.days).toHaveLength(5)
    const last = a.days[a.days.length - 1]
    expect(last.captures).toBe(2)
    expect(last.errors).toBe(9)
    // The day between them is present and empty, not missing.
    expect(a.days[a.days.length - 2]).toEqual({ day: '2026-09-01', captures: 0, errors: 0 })
  })

  it('leaves out captures older than the window without losing them from the totals', () => {
    const a = summarise(
      [
        capture({ capturedAt: new Date('2026-09-02T09:00:00').toISOString() }),
        capture({ capturedAt: new Date('2026-06-01T09:00:00').toISOString(), bytes: 500 })
      ],
      new Date('2026-09-02T23:30:00'),
      { days: 7 }
    )
    expect(a.days.reduce((n, d) => n + d.captures, 0)).toBe(1)
    expect(a.captures).toBe(2)
    expect(a.bytes).toBe(1_000_500)
  })

  it('counts a capture as having findings for a console error alone', () => {
    const a = summarise([capture({ consoleErrors: 3 }), capture({ name: 'clean' })], now)
    expect(a.withFindings).toBe(1)
  })

  it('breaks ties stably, so two reads of one folder agree', () => {
    const facts = [
      capture({ name: 'a', requests: [req({ url: 'https://x.dev/z', status: 500 })] }),
      capture({ name: 'b', requests: [req({ url: 'https://x.dev/a', status: 500 })] })
    ]
    expect(summarise(facts, now).failingEndpoints.map((f) => f.endpoint)).toEqual(
      summarise([...facts].reverse(), now).failingEndpoints.map((f) => f.endpoint)
    )
    expect(summarise(facts, now).failingEndpoints[0].endpoint).toBe('GET x.dev/a')
  })

  it('keeps each table to the limit', () => {
    const facts = [
      capture({
        requests: Array.from({ length: 40 }, (_, i) =>
          req({ url: `https://x.dev/e${i}`, status: 500, durationMs: 100 + i })
        )
      })
    ]
    const a = summarise(facts, now, { limit: 5, minSamples: 1 })
    expect(a.failingEndpoints).toHaveLength(5)
    expect(a.slowest).toHaveLength(5)
  })
})
