import { describe, it, expect } from 'vitest'
import { buildMeta, type MetaInput } from '../bundle'
import { collapseConsole, escapeHtml, renderReport, videoTimeSec } from '../report'

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

  it('keeps the console in the order it happened, so it reads beside the recording', () => {
    // Errors used to be sorted to the top so chatter could not bury them. That broke the
    // one property a console needs next to a video: the line above is what happened
    // before. Hiding chatter solves the burying instead.
    expect(html.indexOf('ordinary chatter')).toBeLessThan(html.indexOf('Cannot read properties of null'))
  })

  it('hides ordinary chatter behind a filter that starts on', () => {
    expect(html).toContain('Problems only')
    expect(html).toContain('(1 hidden)')
    // The line is still in the document, so unticking puts it back where it happened.
    expect(html).toContain('ordinary chatter')
    expect(html).toContain('sev-mute')
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

describe('videoTimeSec', () => {
  it('has no answer when nothing was recorded', () => {
    expect(videoTimeSec(5_000, undefined)).toBeNull()
  })

  it('shifts a session moment onto the video clock', () => {
    // Recording began 20s into the session, so 30s of session is 10s of video.
    expect(videoTimeSec(30_000, 20_000)).toBe(10)
  })

  it('returns null for a moment before the recording started', () => {
    // Nothing to seek to: those frames do not exist.
    expect(videoTimeSec(5_000, 20_000)).toBeNull()
  })

  it('handles a recording that started before the session', () => {
    // A negative offset means the video is already running at the session's origin.
    expect(videoTimeSec(5_000, -10_000)).toBe(15)
  })

  it('maps the exact start of the recording to zero', () => {
    expect(videoTimeSec(20_000, 20_000)).toBe(0)
  })
})

describe('renderReport — a session that also recorded', () => {
  const merged = buildMeta({
    ...base(),
    mediaName: 'snapit-merged.mp4',
    mediaBytes: 2048,
    ext: 'mp4',
    recordingOffsetMs: 20_000,
    markers: [{ atMs: 4_000, note: 'here' }]
  })

  const html = renderReport(merged, {
    actions: [
      { atMs: 5_000, label: 'Click button “Too early”' },
      { atMs: 30_000, label: 'Click button “Place order”' }
    ],
    console: [{ atMs: 32_000, level: 'error', text: 'boom', count: 1 }]
  })

  it('makes a step that happened on camera seekable', () => {
    // 30s session - 20s offset = 10s into the video.
    expect(html).toContain('data-at="10.000"')
  })

  it('leaves a step from before the recording as plain text', () => {
    expect(html).toContain('Too early')
    expect(html).not.toContain('data-at="-15.000"')
  })

  it('seeks console errors onto the video too', () => {
    expect(html).toContain('data-at="12.000"')
  })

  it('treats markers as already being on the video clock', () => {
    // The recorder stamps them, so they need no conversion.
    expect(html).toContain('data-at="4.000"')
  })

  it('includes the seek script exactly once', () => {
    expect(html.match(/<script>/g)).toHaveLength(1)
  })

  it('has no seek controls at all when there is no video', () => {
    const sessionOnly = renderReport(
      buildMeta({
        ...base(),
        kind: 'browser-session',
        mediaName: undefined,
        mediaBytes: undefined,
        ext: undefined
      }),
      { actions: [{ atMs: 5_000, label: 'Click' }] }
    )
    expect(sessionOnly).not.toContain('data-at')
    expect(sessionOnly).not.toContain('<script')
  })
})

describe('collapseConsole', () => {
  it('folds identical messages into one line with a count', () => {
    const collapsed = collapseConsole([
      { atMs: 100, level: 'error', text: 'boom' },
      { atMs: 200, level: 'error', text: 'boom' },
      { atMs: 300, level: 'error', text: 'boom' }
    ])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].count).toBe(3)
  })

  it('keeps the first timestamp, which is where the problem started', () => {
    const collapsed = collapseConsole([
      { atMs: 100, level: 'error', text: 'boom' },
      { atMs: 9000, level: 'error', text: 'boom' }
    ])
    expect(collapsed[0].atMs).toBe(100)
  })

  it('does not fold the same text logged at different levels', () => {
    const collapsed = collapseConsole([
      { atMs: 1, level: 'warning', text: 'slow' },
      { atMs: 2, level: 'error', text: 'slow' }
    ])
    expect(collapsed).toHaveLength(2)
  })
})

describe('renderReport — reading it', () => {
  const meta = buildMeta({ ...base(), markers: [{ atMs: 1000, note: 'here' }] })

  it('leads with what went wrong, not with the display configuration', () => {
    const html = renderReport(meta, {
      console: [{ atMs: 10, level: 'error', text: 'boom' }],
      failedRequests: [{ method: 'POST', status: 500, url: 'https://api.test/orders' }],
      actions: [{ atMs: 5, label: 'Click' }]
    })
    // The counts are anchors as well as a summary, so one element does both jobs.
    expect(html).toContain('href="#console"')
    expect(html).toContain('href="#requests"')
    expect(html).toContain('<b>1</b> console error')
    // The environment table is reference material once there is a timeline.
    expect(html).toMatch(/<details class="panel env"><summary>/)
  })

  it('opens the environment when it is the whole story', () => {
    // A plain recording has no timeline, so the table is all there is to read.
    expect(renderReport(buildMeta(base()))).toContain('<details class="panel env" open>')
  })

  it('sticks the media beside the timeline, and drops the column when there is none', () => {
    const withTimeline = renderReport(meta, { actions: [{ atMs: 5, label: 'Click' }] })
    expect(withTimeline).toContain('class="split"')
    expect(withTimeline).toContain('class="media-col"')
    // A timestamp is only worth clicking if the player it seeks is still on screen.
    expect(withTimeline).toContain('position: sticky')
    expect(renderReport(buildMeta(base()))).toContain('class="solo"')
  })

  it('collapses a repeated console line rather than filling the report with it', () => {
    const flood = Array.from({ length: 400 }, (_, i) => ({
      atMs: i * 10,
      level: 'error',
      text: 'the same failure'
    }))
    const html = renderReport(meta, { console: flood })
    expect(html.match(/the same failure/g)).toHaveLength(1)
    expect(html).toContain('×400')
    expect(html).not.toContain('more, see the JSON beside this file')
  })

  it('offers no filter when every line is a problem', () => {
    // Filtering to an identical list is a control that does nothing.
    const html = renderReport(meta, { console: [{ atMs: 1, level: 'error', text: 'boom' }] })
    expect(html).not.toContain('Problems only')
  })

  it('marks a failed request by whether it is the bug or the symptom', () => {
    const html = renderReport(meta, {
      failedRequests: [
        { method: 'POST', status: 500, url: 'https://api.test/orders' },
        { method: 'GET', status: 404, url: 'https://api.test/favicon.ico' }
      ]
    })
    expect(html).toContain('class="sev-error"')
    expect(html).toContain('class="sev-warn"')
  })

  it('moves the highlight down the timeline as the recording plays', () => {
    const html = renderReport(buildMeta({ ...base(), recordingOffsetMs: 0 }), {
      actions: [{ atMs: 1000, label: 'Click' }]
    })
    expect(html).toContain("classList.toggle('now'")
    expect(html.match(/<script>/g)).toHaveLength(1)
  })
})
