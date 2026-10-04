import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { harFromMessages } from 'chrome-har'
import { collectRelayed, type RelayedEvent } from '../relayed'
import { redactHar } from '../redact'
import { looseEntries, statusOf } from '../har'

/**
 * Real output from the extension, through the real pipeline.
 *
 * The fixture was captured from Chrome 154 by loading `extension/` and driving it: a
 * navigation, a `console.error`, and a `fetch` to a missing path. Everything else about
 * the extension is argued from documentation; this is the one test that is evidence.
 *
 * It is deliberately a whole-pipeline test rather than a unit one. The claim being
 * defended is that `chrome.debugger` output needs no translation to reach a bundle — so
 * anything that stubs a step is not testing the claim.
 */
const events = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'extension-session.json'), 'utf-8')
) as RelayedEvent[]

describe('a session relayed by the extension', () => {
  const { console: lines, navigations, harMessages } = collectRelayed(events)
  const har = redactHar(harFromMessages(harMessages, { includeTextFromResponseBody: false }) as never)
  const entries = looseEntries(har)

  test('chrome-har reconstructs requests from what Chrome actually sent', () => {
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => typeof e.request?.url === 'string')).toBe(true)
  })

  test('the failed request survives to where the report reads it', () => {
    expect(entries.some((e) => statusOf(e) === 404)).toBe(true)
  })

  test('the console error survives', () => {
    expect(lines.some((l) => l.text.includes('a console error'))).toBe(true)
  })

  test('the navigation survives', () => {
    expect(navigations.some((n) => n.url.includes('example.com'))).toBe(true)
  })

  test('every forwarded event is one the app has a use for', () => {
    // The extension filters before sending. If this fails, either the filter widened or
    // the app grew a reader for something it is not being sent.
    const unused = new Set(
      events
        .map((e) => e.method)
        .filter(
          (m) =>
            !m.startsWith('Network.') &&
            !m.startsWith('Page.') &&
            !m.startsWith('Runtime.') &&
            !m.startsWith('Log.')
        )
    )
    expect([...unused]).toEqual([])
  })
})
