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
      expectedExtensionVersion: '0.1.0',
      onSessionStart: (h) => {
        handle = h
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
  test('hands the token to our extension', async () => {
    const res = await call('/collector/pair')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, token: TOKEN, expects: '0.1.0' })
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

  test('beginCapture throws away what came before the bug', async () => {
    handle!.beginCapture()
    expect(bridgeSession()?.events).toBe(0)
    await authed('/collector/events', { events: [{ method: 'Page.loadEventFired', params: {}, atMs: 1 }] })
    expect(bridgeSession()?.events).toBe(1)
  })

  test('stop assembles a CollectedSession the rest of the app already reads', async () => {
    const events = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'extension-session.json'), 'utf-8')
    ) as RelayedEvent[]
    await authed('/collector/events', { events })
    const collected = await handle!.stop()
    expect(collected.startedAt).toMatch(/^\d{4}-/)
    expect(collected.console.some((c) => c.text.includes('a console error'))).toBe(true)
    expect(collected.navigations.some((n) => n.url.includes('example.com'))).toBe(true)
    expect((collected.har as { log: { entries: unknown[] } }).log.entries.length).toBeGreaterThan(0)
    // Not built yet, and honest about it rather than absent from the type.
    expect(collected.actions).toEqual([])
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
