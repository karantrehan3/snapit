import { describe, expect, test } from 'vitest'
import { harFromMessages } from 'chrome-har'
import { collectRelayed, type RelayedEvent } from '../relayed'
import { redactHar } from '../redact'
import { looseEntries, statusOf } from '../har'

/**
 * The pivot's load-bearing claim, tested rather than asserted.
 *
 * The extension forwards `chrome.debugger` events; the app is supposed to feed them to the
 * same `chrome-har` it has always used and get the same HAR. If that is false, the
 * extension is a rewrite rather than a swap, and this is where that shows up.
 *
 * The event sequence below is a real one: a request that 500s, with the extra-info events
 * Chrome interleaves and the headers `redact.ts` exists to strip.
 */
const sequence = (): RelayedEvent[] => {
  const requestId = '1000.3'
  const frameId = 'FRAME1'
  const wall = 1_759_000_000
  const mono = 100

  return [
    // `Page.frameStartedLoading` is what chrome-har creates a page from — `frameNavigated`
    // is NOT one of the events it buckets on, so without this every request lands in
    // `entriesWithoutPage` and is dropped. The extension has to forward both: this one for
    // the HAR, `frameNavigated` for the URL the navigation trail shows.
    { atMs: 0, method: 'Page.frameStartedLoading', params: { frameId } },
    {
      atMs: 1,
      method: 'Page.frameNavigated',
      params: { frame: { id: frameId, url: 'https://app.test/cart' } }
    },
    {
      atMs: 10,
      method: 'Network.requestWillBeSent',
      params: {
        requestId,
        frameId,
        loaderId: 'LOADER1',
        documentURL: 'https://app.test/cart',
        request: {
          url: 'https://app.test/api/v1/checkout',
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: 'session=secret-value' },
          postData: '{"coupon":"SAVE10"}'
        },
        timestamp: mono,
        wallTime: wall,
        initiator: { type: 'script' },
        type: 'XHR'
      }
    },
    {
      atMs: 180,
      method: 'Network.responseReceived',
      params: {
        requestId,
        frameId,
        loaderId: 'LOADER1',
        timestamp: mono + 0.18,
        type: 'XHR',
        response: {
          url: 'https://app.test/api/v1/checkout',
          status: 500,
          statusText: 'Internal Server Error',
          protocol: 'http/1.1',
          headers: { 'content-type': 'application/json', 'set-cookie': 'tracking=abc' },
          mimeType: 'application/json',
          connectionId: 1,
          encodedDataLength: 120,
          timing: {
            requestTime: mono,
            dnsStart: -1,
            dnsEnd: -1,
            connectStart: 0,
            connectEnd: 10,
            sslStart: -1,
            sslEnd: -1,
            sendStart: 11,
            sendEnd: 12,
            receiveHeadersEnd: 170
          }
        }
      }
    },
    {
      atMs: 181,
      method: 'Network.dataReceived',
      params: { requestId, timestamp: mono + 0.181, dataLength: 98, encodedDataLength: 120 }
    },
    {
      atMs: 190,
      method: 'Network.loadingFinished',
      params: { requestId, timestamp: mono + 0.19, encodedDataLength: 120 }
    },
    { atMs: 200, method: 'Page.loadEventFired', params: { timestamp: mono + 0.2 } }
  ]
}

describe('a HAR from relayed debugger events', () => {
  const { harMessages, navigations } = collectRelayed(sequence())
  const har = redactHar(harFromMessages(harMessages, { includeTextFromResponseBody: false }) as never)
  const entries = looseEntries(har)

  test('chrome-har reconstructs the request from what the extension forwards', () => {
    expect(entries).toHaveLength(1)
    expect(entries[0]!.request?.url).toBe('https://app.test/api/v1/checkout')
    expect(entries[0]!.request?.method).toBe('POST')
  })

  test('the failure is visible to the same helper the report uses', () => {
    expect(statusOf(entries[0]!)).toBe(500)
  })

  test('redaction still applies — the cookie never reaches the bundle', () => {
    const serialised = JSON.stringify(har)
    expect(serialised).not.toContain('secret-value')
    expect(serialised).not.toContain('tracking=abc')
    expect(serialised).toContain('[redacted by snapit]')
  })

  test('the navigation trail comes through alongside it', () => {
    expect(navigations).toEqual([{ atMs: 1, url: 'https://app.test/cart' }])
  })
})
