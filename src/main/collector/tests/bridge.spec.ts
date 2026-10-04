import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bridgeSession, startCollectorBridge, stopCollectorBridge } from '../bridge'
import { extensionOrigin } from '../bridgeAuth'
import type { RelayedEvent } from '../relayed'
import type { CollectorHandle } from '../session'

/**
 * The bridge over a real socket, because the interesting failures are HTTP ones: a wrong
 * origin, a stale token, a batch arriving after the session ended.
 */
const PORT = 47399
const ID = 'flhandipbjjgpogpdoemadcebhjlgneo'
const ORIGIN = extensionOrigin(ID)
const TOKEN = 'collector-token-for-the-test'
const API = `http://127.0.0.1:${PORT}`

let handle: CollectorHandle | null = null
let ended: string | null = null
let mismatch: [string, string] | null = null
let allowPairing = true
let paired = false
let adopts = true

const call = (path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

const authed = (path: string, body?: unknown): Promise<Response> =>
  call(path, body, { authorization: `Bearer ${TOKEN}` })

beforeAll(() => {
  startCollectorBridge(
    {
      token: () => TOKEN,
      extensionId: () => ID,
      pairingAllowed: () => allowPairing,
      onPaired: () => {
        paired = true
      },
      expectedExtensionVersion: '0.1.0',
      onSessionStart: (h) => {
        handle = h
        return adopts
      },
      onSessionEnd: (reason) => {
        ended = reason
      },
      onVersionMismatch: (found, expected) => {
        mismatch = [found, expected]
      }
    },
    PORT
  )
})
afterAll(() => stopCollectorBridge())

describe('pairing', () => {
  test('hands the token to our extension, and tells the app it happened', async () => {
    const res = await call('/collector/pair')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, token: TOKEN, expects: '0.1.0' })
    // The app closes its pairing window on this, rather than leaving it open for the
    // full five minutes after the handshake it existed for.
    expect(paired).toBe(true)
  })

  test('refuses a web page outright', async () => {
    const res = await fetch(`${API}/collector/pair`, {
      method: 'POST',
      headers: { origin: 'https://evil.test' }
    })
    expect(res.status).toBe(403)
  })

  test('refuses while pairing is off', async () => {
    allowPairing = false
    expect((await call('/collector/pair')).status).toBe(403)
    allowPairing = true
  })
})

describe('a session', () => {
  test('refuses an extension built against another protocol', async () => {
    const res = await authed('/collector/start', { tabId: 1, version: '9.0.0' })
    expect(res.status).toBe(409)
    expect(mismatch).toEqual(['9.0.0', '0.1.0'])
  })

  test('starts, and hands the app a CollectorHandle', async () => {
    expect((await authed('/collector/start', { tabId: 7, version: '0.1.0' })).status).toBe(200)
    expect(handle).not.toBeNull()
    expect(bridgeSession()).toMatchObject({ tabId: 7 })
  })

  test('takes batches', async () => {
    const events = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'extension-session.json'), 'utf-8')
    ) as RelayedEvent[]
    const res = await authed('/collector/events', { events })
    expect(await res.json()).toMatchObject({ ok: true, received: events.length })
    expect(bridgeSession()?.events).toBe(events.length)
  })

  test('refuses a batch with no token, and one from a page', async () => {
    expect((await call('/collector/events', { events: [] })).status).toBe(401)
    expect(
      (await fetch(`${API}/collector/events`, { method: 'POST', headers: { origin: 'https://evil.test' } }))
        .status
    ).toBe(403)
  })

  test('beginCapture keeps the frame lifecycle, and drops the rest', async () => {
    const before = bridgeSession()!.events
    expect(before).toBeGreaterThan(0)
    handle!.beginCapture()
    const after = bridgeSession()!.events

    // Network and Page events survive on purpose. Dropping them is the obvious move and
    // the wrong one: chrome-har maps each request to a page using the frame lifecycle
    // that came before it, so discarding those makes every later request unmappable.
    // The HAR is filtered at assembly instead — see `trimHarBefore`.
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })

  test('the HAR is trimmed to the capture window, not to the event buffer', async () => {
    // Everything in the fixture predates the `beginCapture` above, so a correct trim
    // leaves no entries — the requests happened while getting to the bug.
    const collected = await handle!.stop()
    expect((collected.har as { log: { entries: unknown[] } }).log.entries).toEqual([])
  })

  test('a fresh session assembles everything the rest of the app reads', async () => {
    await authed('/collector/start', { tabId: 8, version: '0.1.0' })
    const events = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'extension-session.json'), 'utf-8')
    ) as RelayedEvent[]
    await authed('/collector/events', { events })

    const collected = await handle!.stop()
    expect(collected.startedAt).toMatch(/^\d{4}-/)
    expect(collected.console.some((c) => c.text.includes('a console error'))).toBe(true)
    expect(collected.navigations.some((n) => n.url.includes('example.com'))).toBe(true)
    expect((collected.har as { log: { entries: unknown[] } }).log.entries.length).toBeGreaterThan(0)
    // The fixture predates the content-script handover, so it carries no bindingCalled
    // events and therefore no actions. A session recorded now would.
    expect(collected.actions).toEqual([])
  })

  test('a session the app will not take is dropped, not buffered', async () => {
    // Otherwise the extension keeps posting into a buffer nothing will ever collect.
    adopts = false
    const res = await authed('/collector/start', { tabId: 99, version: '0.1.0' })
    expect(res.status).toBe(409)
    expect(bridgeSession()).toBeNull()
    adopts = true
  })

  test('a batch after the session ended tells the extension to detach', async () => {
    // 410 is the signal `background.ts` acts on — anything else and it keeps debugging a
    // tab nobody is collecting.
    expect((await authed('/collector/events', { events: [] })).status).toBe(410)
  })

  test('stop notifies the app with the reason', async () => {
    await authed('/collector/stop', { reason: 'user' })
    expect(ended).toBe('user')
  })
})
