declare global {
  // The debug handle background.ts hangs on globalThis; see the note there.
  // eslint-disable-next-line no-var
  var snapit: {
    start: (t: number) => Promise<void>
    stop: () => Promise<void>
    pair: (p?: number) => Promise<string>
  }
}

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright-core'
import { bridgeSession, startCollectorBridge, stopCollectorBridge } from '../bridge'
import type { CollectorHandle } from '../session'

/**
 * The whole thing, once: real Chrome, the real extension, the real bridge.
 *
 * Everything else about this collector is tested against fixtures or a socket. This is the
 * one that would have caught `--load-extension` being removed, and the one that catches the
 * next thing like it. It is skipped where Chrome is not installed so CI stays green, which
 * is the trade — a test that only runs on a developer's machine is still worth more than an
 * argument that it ought to work.
 */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EXTENSION = new URL('../../../../extension', import.meta.url).pathname
const CDP_PORT = 45997
const BRIDGE_PORT = 47398
const PROFILE = `${process.env.TMPDIR ?? '/tmp'}/snapit-e2e-${Date.now()}`

/**
 * Opt-in: `npm run test:e2e`.
 *
 * It launches Chrome and takes twelve seconds, and a default `npm test` that does that is
 * one people stop running. The flag is the trade — this has to be remembered, so the
 * commit that changes the extension is the one that should run it.
 */
const available =
  process.env.SNAPIT_E2E === '1' && existsSync(CHROME) && existsSync(`${EXTENSION}/dist/background.js`)

describe.skipIf(!available)('extension → bridge, end to end', () => {
  let chrome: ChildProcess
  let browser: Browser
  let handle: CollectorHandle | null = null
  let collected: Awaited<ReturnType<CollectorHandle['stop']>> | null = null

  beforeAll(async () => {
    startCollectorBridge(
      {
        token: () => 'e2e-token',
        extensionId: () => 'flhandipbjjgpogpdoemadcebhjlgneo',
        pairingAllowed: () => true,
        expectedExtensionVersion: '0.1.0',
        onSessionStart: (h) => {
          handle = h
        },
        onSessionEnd: () => {},
        onVersionMismatch: () => {}
      },
      BRIDGE_PORT
    )

    chrome = spawn(
      CHROME,
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE}`,
        // Chrome 137 removed --load-extension from branded builds; this is the replacement
        // path, and the extension is loaded over CDP below.
        '--enable-unsafe-extension-debugging',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
      ],
      { stdio: 'ignore' }
    )

    for (let i = 0; i < 40; i++) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }, 60_000)

  afterAll(async () => {
    stopCollectorBridge()
    await browser?.close().catch(() => undefined)
    chrome?.kill()
  })

  test('loads, pairs, records and assembles a session', async () => {
    const ctx = browser.contexts()[0]!
    const cdp = await browser.newBrowserCDPSession()
    const { id } = (await cdp.send(
      'Extensions.loadUnpacked' as Parameters<typeof cdp.send>[0],
      { path: EXTENSION } as never
    )) as unknown as { id: string }
    expect(id).toBe('flhandipbjjgpogpdoemadcebhjlgneo')

    const page = await ctx.newPage()
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })

    let sw = ctx.serviceWorkers().find((w) => w.url().includes(id))
    for (let i = 0; i < 40 && !sw; i++) {
      await new Promise((r) => setTimeout(r, 400))
      sw = ctx.serviceWorkers().find((w) => w.url().includes(id))
    }
    expect(sw, 'service worker should be running').toBeTruthy()

    // Pairing against the real bridge, over the real origin check.
    expect(await sw!.evaluate((p) => globalThis.snapit.pair(p), BRIDGE_PORT)).toBe('paired')

    const tabs = (await sw!.evaluate(async () =>
      (await chrome.tabs.query({})).map((t) => ({ id: t.id, url: t.url }))
    )) as Array<{ id: number; url: string }>
    const target = tabs.find((t) => t.url?.startsWith('http'))!

    await sw!.evaluate((tid) => globalThis.snapit.start(tid), target.id)
    expect(handle, 'the bridge should have been told a session began').toBeTruthy()

    await page.goto('https://example.com/?e2e=1', { waitUntil: 'domcontentloaded' })

    // A real click, so the injected binding has something to report. This is the part
    // that proves the app's own action recorder reaches the page through the debugger.
    await page.click('a').catch(() => undefined)
    await page.evaluate(() => {
      console.error('e2e: a console error')
      return fetch('/e2e-missing-404').catch(() => {})
    })
    await new Promise((r) => setTimeout(r, 4500))
    expect(bridgeSession()!.events).toBeGreaterThan(0)

    collected = await handle!.stop()
    expect(collected.console.some((c) => c.text.includes('a console error'))).toBe(true)
    expect(collected.navigations.some((n) => n.url.includes('example.com'))).toBe(true)

    const entries = (collected.har as { log: { entries: Array<Record<string, never>> } }).log.entries
    expect(entries.length).toBeGreaterThan(0)

    // The action trail, recorded by the app's INJECTED_SCRIPT running in the tester's own
    // page — not a content script the extension carries a copy of.
    expect(collected.actions.length).toBeGreaterThan(0)
    expect(collected.actions[0]).toMatchObject({ type: 'click' })
    expect(collected.actions[0]!.selectors.length).toBeGreaterThan(0)

    // And a response body, which no CDP event carries — fetched by the extension over
    // the debugger and reattached to the HAR by the app.
    const withBody = entries.filter(
      (e) => typeof (e as { response?: { content?: { text?: string } } }).response?.content?.text === 'string'
    )
    expect(withBody.length, 'at least one entry should carry a response body').toBeGreaterThan(0)
  }, 90_000)
})
