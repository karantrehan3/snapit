import { describe, it, expect } from 'vitest'
import { REDACTED } from '../collector/redact'
import type { ReportRequest } from '../reportRequests'
import { isFailedStatus } from '../collector/har'
import { keepMostTelling, reportRequests, requestAtMs, requestPhases, usefulHeaders } from '../reportRequests'

const ORIGIN = Date.parse('2026-08-25T14:11:36.930Z')

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  startedDateTime: '2026-08-25T14:12:03.880Z',
  time: 554.9,
  timings: { wait: 549.05 },
  _resourceType: 'xhr',
  request: { method: 'POST', url: 'https://api.test/orders', headers: [] },
  response: {
    status: 500,
    statusText: 'Internal Server Error',
    headers: [],
    content: { mimeType: 'application/json; charset=utf-8', size: 87, text: '{"error":"boom"}' },
    _transferSize: 678
  },
  ...over
})

const har = (entries: unknown[]): unknown => ({ log: { version: '1.2', entries } })

describe('reportRequests', () => {
  it('puts a request on the capture clock, not the wall clock', () => {
    const [r] = reportRequests(har([entry()]), ORIGIN)
    // 14:12:03.880 minus 14:11:36.930 is 26.95s into the capture.
    expect(r.atMs).toBe(26_950)
  })

  it('carries what a reader opens a request for', () => {
    const [r] = reportRequests(har([entry()]), ORIGIN)
    expect(r).toMatchObject({
      method: 'POST',
      status: 500,
      statusText: 'Internal Server Error',
      resourceType: 'xhr',
      mimeType: 'application/json',
      bytes: 678,
      durationMs: 555,
      phases: { beforeMs: 0, waitMs: 549, receiveMs: 0 },
      body: '{"error":"boom"}'
    })
  })

  it('keeps successful requests, which the old failed-only list threw away', () => {
    const requests = reportRequests(har([entry({ response: { status: 200 } }), entry()]), ORIGIN)
    expect(requests).toHaveLength(2)
    expect(requests.filter((r) => isFailedStatus(r.status))).toHaveLength(1)
  })

  it('reads nothing out of a HAR that is not one', () => {
    expect(reportRequests(null, ORIGIN)).toEqual([])
    expect(reportRequests({ log: {} }, ORIGIN)).toEqual([])
    expect(reportRequests({ log: { entries: 'no' } }, ORIGIN)).toEqual([])
  })

  it('survives an entry with nothing in it', () => {
    const [r] = reportRequests(har([{}]), ORIGIN)
    expect(r).toMatchObject({ atMs: null, method: 'GET', status: 0, url: '' })
  })

  it('orders chronologically, with the unplaceable last', () => {
    const requests = reportRequests(
      har([
        entry({ startedDateTime: undefined, request: { url: 'https://api.test/unknown' } }),
        entry({ startedDateTime: '2026-08-25T14:13:00.000Z', request: { url: 'https://api.test/late' } }),
        entry({ startedDateTime: '2026-08-25T14:11:40.000Z', request: { url: 'https://api.test/early' } })
      ]),
      ORIGIN
    )
    expect(requests.map((r) => r.url)).toEqual([
      'https://api.test/early',
      'https://api.test/late',
      'https://api.test/unknown'
    ])
  })

  it('never reports a negative moment for a request that just beat the origin', () => {
    const [r] = reportRequests(har([entry({ startedDateTime: '2026-08-25T14:11:36.000Z' })]), ORIGIN)
    expect(r.atMs).toBe(0)
  })

  it('treats an unmeasured timing as absent rather than as -1', () => {
    const [r] = reportRequests(har([entry({ time: -1, timings: { wait: -1 } })]), ORIGIN)
    expect(r.durationMs).toBeUndefined()
    expect(r.phases).toBeUndefined()
  })
})

describe('usefulHeaders', () => {
  it('drops what redaction already emptied, and counts it', () => {
    const { headers, redacted } = usefulHeaders([
      { name: 'content-type', value: 'application/json' },
      { name: 'authorization', value: REDACTED },
      { name: 'cookie', value: REDACTED }
    ])
    expect(headers).toEqual([{ name: 'content-type', value: 'application/json' }])
    expect(redacted).toBe(2)
  })

  it('folds away the duplicate chrome-har reconstructs each list with', () => {
    const { headers } = usefulHeaders([
      { name: 'Content-Type', value: 'application/json' },
      { name: 'content-type', value: 'application/json' }
    ])
    expect(headers).toEqual([{ name: 'Content-Type', value: 'application/json' }])
  })

  it('keeps two headers of the same name with different values', () => {
    // A real thing that happens, and exactly what someone opens a request to find.
    const { headers } = usefulHeaders([
      { name: 'vary', value: 'Origin' },
      { name: 'vary', value: 'Accept-Language' }
    ])
    expect(headers).toHaveLength(2)
  })

  it('counts a repeated redaction once', () => {
    const { redacted } = usefulHeaders([
      { name: 'Cookie', value: REDACTED },
      { name: 'cookie', value: REDACTED }
    ])
    expect(redacted).toBe(1)
  })

  it('caps a pathological header list', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `x-${i}`, value: 'v' }))
    expect(usefulHeaders(many).headers).toHaveLength(30)
  })

  it('ignores anything that is not a name/value pair', () => {
    expect(usefulHeaders('nope')).toEqual({ headers: [], redacted: 0 })
    expect(usefulHeaders([{ value: 'orphan' }, null, 7]).headers).toEqual([])
  })
})

describe('requestAtMs', () => {
  it('has no answer for a timestamp it cannot read', () => {
    expect(requestAtMs(undefined, ORIGIN)).toBeNull()
    expect(requestAtMs('not a date', ORIGIN)).toBeNull()
    expect(requestAtMs(1234, ORIGIN)).toBeNull()
  })
})

describe('keepMostTelling', () => {
  const at = (atMs: number, status: number): ReportRequest => ({
    atMs,
    method: 'GET',
    status,
    url: `https://api.test/${atMs}`,
    requestHeaders: [],
    responseHeaders: [],
    redactedHeaders: 0
  })

  it('returns everything when it already fits', () => {
    const requests = [at(1, 200), at(2, 500)]
    expect(keepMostTelling(requests, 5)).toEqual(requests)
  })

  it('drops successes rather than failures, and keeps the order they happened in', () => {
    // Truncating chronologically would lose the 500 at the end of a busy session, which
    // is the one entry the report exists for.
    const noise = Array.from({ length: 20 }, (_, i) => at(i, 200))
    const late = at(9999, 500)
    const kept = keepMostTelling([...noise, late], 5)
    expect(kept).toHaveLength(5)
    expect(kept.filter((r) => r.status === 500)).toHaveLength(1)
    expect(kept.map((r) => r.atMs)).toEqual(
      [...kept].sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0)).map((r) => r.atMs)
    )
  })

  it('keeps failures over successes even when every row is a failure', () => {
    const all = Array.from({ length: 10 }, (_, i) => at(i, 500))
    expect(keepMostTelling(all, 3)).toHaveLength(3)
  })
})

describe('requestPhases', () => {
  it('splits a request into connecting, waiting and downloading', () => {
    expect(requestPhases({ blocked: 4, dns: 1, connect: 20, send: 1, wait: 500, receive: 8 })).toEqual({
      beforeMs: 26,
      waitMs: 500,
      receiveMs: 8
    })
  })

  it('does not add ssl to connect, which already contains it', () => {
    // HAR defines ssl as counted inside connect; summing both inflates every HTTPS row.
    const phases = requestPhases({ connect: 584, ssl: 306, wait: 700, receive: 1 })
    expect(phases?.beforeMs).toBe(584)
  })

  it('reads an unmeasured phase as zero rather than as -1', () => {
    expect(requestPhases({ blocked: -1, dns: -1, connect: -1, send: 2, wait: 30, receive: 4 })).toEqual({
      beforeMs: 2,
      waitMs: 30,
      receiveMs: 4
    })
  })

  it('has nothing to report when nothing was measured', () => {
    expect(requestPhases(undefined)).toBeUndefined()
    expect(requestPhases({ blocked: -1, wait: -1, receive: -1 })).toBeUndefined()
  })

  it('adds up to the entry duration on a real capture', () => {
    // From a real HAR: the phases must reconstruct `time`, or the bar lies about width.
    const phases = requestPhases({
      blocked: 0.334,
      dns: 0.004,
      connect: 584.533,
      send: 0.268,
      wait: 710.695,
      receive: 0.238,
      ssl: 305.979
    })
    // `time` on that entry was 1296.07; the phases reconstruct it to the millisecond
    // they are rounded to, which is what the bar is drawn from.
    const total = (phases?.beforeMs ?? 0) + (phases?.waitMs ?? 0) + (phases?.receiveMs ?? 0)
    expect(total).toBe(1296)
  })
})
