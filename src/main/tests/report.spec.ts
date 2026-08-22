import { describe, it, expect } from 'vitest'
import { buildMeta, type MetaInput } from '../bundle'
import { escapeHtml, renderReport } from '../report'

const base = (over: Partial<MetaInput> = {}): MetaInput => ({
  capturedAt: new Date('2026-08-22T12:31:07.000Z'),
  appVersion: '3.2.0',
  platform: 'darwin',
  release: '25.5.0',
  arch: 'arm64',
  locale: 'en-GB',
  timeZone: 'Europe/London',
  displays: [
    {
      id: 1,
      label: 'Built-in Retina Display',
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
      scaleFactor: 2,
      isPrimary: true
    }
  ],
  durationMs: 64_000,
  hasSystemAudio: false,
  markers: [],
  source: { id: 'window:42:0', name: 'Checkout — Chrome', type: 'window' },
  mediaName: 'snapit-2026-08-22_14-31-07.mp4',
  mediaBytes: 1_572_864,
  ext: 'mp4',
  ...over
})

/**
 * The self-containment rule: the page must fetch nothing. It may freely *display*
 * URLs — the failed-requests section exists to show them — so this checks what the
 * markup references, not what the text contains.
 */
function expectFetchesNothing(html: string): void {
  expect(html).not.toMatch(/<link\b/i)
  expect(html).not.toMatch(/<script[^>]+\bsrc\s*=/i)
  expect(html).not.toMatch(/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i)
  expect(html).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i)
  expect(html).not.toMatch(/@import/i)
}

describe('renderReport', () => {
  it('embeds the media by relative name, so the folder is portable', () => {
    const html = renderReport(buildMeta(base()))
    expect(html).toContain('src="snapit-2026-08-22_14-31-07.mp4"')
  })

  it('fetches nothing from the network', () => {
    // The whole point of the bundle: it has to open on a machine with no network
    // and no trust. Any external reference breaks that, silently. Inline script is
    // fine — marker seeking needs it — but a script with a src is not.
    expectFetchesNothing(renderReport(buildMeta(base({ markers: [{ atMs: 7400, note: 'checkout 500s' }] }))))
  })

  it('displays a captured URL without turning it into a request', () => {
    const html = renderReport(buildMeta(base()), {
      failedRequests: [{ method: 'GET', status: 500, url: 'https://api.test/orders' }]
    })
    expect(html).toContain('https://api.test/orders')
    expectFetchesNothing(html)
  })

  it('plays video but shows a gif as an image', () => {
    expect(renderReport(buildMeta(base()))).toContain('<video')
    const gif = renderReport(buildMeta(base({ ext: 'gif', mediaName: 'snapit.gif' })))
    expect(gif).toContain('<img')
    expect(gif).not.toContain('<video')
  })

  it('escapes window titles, which are arbitrary text from other applications', () => {
    const html = renderReport(
      buildMeta(base({ source: { id: 'window:1:0', name: '<img src=x onerror=alert(1)>', type: 'window' } }))
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes a quote in the media filename rather than breaking out of the attribute', () => {
    const html = renderReport(buildMeta(base({ mediaName: 'a" onerror="alert(1).mp4' })))
    expect(html).not.toContain('onerror="alert(1)')
  })

  it('reports the display configuration', () => {
    const html = renderReport(buildMeta(base()))
    expect(html).toContain('1512×982 @ 2x')
    expect(html).toContain('Built-in Retina Display (primary)')
  })
})

describe('escapeHtml', () => {
  it('covers every character that can escape a quoted attribute', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('renderReport — browser session', () => {
  const sessionMeta = buildMeta({
    ...base(),
    kind: 'browser-session',
    mediaName: undefined,
    mediaBytes: undefined,
    ext: undefined,
    source: null,
    collected: {
      console: 12,
      consoleErrors: 2,
      requests: 30,
      failedRequests: 1,
      actions: 4,
      navigations: 2
    }
  })

  const html = renderReport(sessionMeta, {
    console: [
      { atMs: 1000, level: 'log', text: 'ordinary chatter' },
      { atMs: 8000, level: 'error', text: 'Cannot read properties of null' }
    ],
    actions: [{ atMs: 500, label: 'Click button “Place order”' }],
    failedRequests: [{ method: 'POST', status: 500, url: 'https://api.test/orders' }]
  })

  it('renders no media element when there is nothing to play', () => {
    expect(html).not.toContain('<video')
    expect(html).not.toContain('<img')
    expect(html).toContain('Browser session')
  })

  it('shows the repro steps, failed requests and console', () => {
    expect(html).toContain('Steps to reproduce')
    expect(html).toContain('Click button “Place order”')
    expect(html).toContain('Failed requests')
    expect(html).toContain('https://api.test/orders')
    expect(html).toContain('Cannot read properties of null')
  })

  it('puts errors above ordinary chatter, which would otherwise bury them', () => {
    expect(html.indexOf('Cannot read properties of null')).toBeLessThan(html.indexOf('ordinary chatter'))
  })

  it('summarises what the sibling JSON files hold', () => {
    expect(html).toContain('2 console errors')
    expect(html).toContain('1 failed of 30 requests')
  })

  it('is still self-contained, and has no marker script to justify one', () => {
    expectFetchesNothing(html)
    expect(html).not.toMatch(/<script/)
  })

  it('escapes console text, which is arbitrary output from the page', () => {
    const nasty = renderReport(sessionMeta, {
      console: [{ atMs: 0, level: 'error', text: '<img src=x onerror=alert(1)>' }]
    })
    expect(nasty).not.toContain('<img src=x')
    expect(nasty).toContain('&lt;img src=x')
  })
})

describe('renderReport — recording still works', () => {
  it('keeps the video and omits the collector sections', () => {
    const html = renderReport(buildMeta(base()))
    expect(html).toContain('<video')
    expect(html).not.toContain('Steps to reproduce')
    expect(html).not.toContain('Failed requests')
  })
})
