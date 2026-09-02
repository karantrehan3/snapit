import { describe, it, expect } from 'vitest'
import { buildMeta, type MetaInput } from '../bundle'
import { collapseConsole, escapeHtml, renderReport, videoTimeSec } from '../report'
import type { ReportRequest } from '../reportRequests'

/** A request as the report receives it, with only the interesting fields spelled out. */
const req = (over: Partial<ReportRequest> = {}): ReportRequest => ({
  atMs: 0,
  method: 'GET',
  status: 200,
  url: 'https://api.test/thing',
  name: 'thing',
  domain: 'api.test',
  group: 'xhr',
  requestHeaders: [],
  responseHeaders: [],
  redactedHeaders: 0,
  ...over
})

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
      requests: [req({ status: 500, url: 'https://api.test/orders' })]
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
    requests: [req({ method: 'POST', status: 500, url: 'https://api.test/orders' })]
  })

  it('renders no media element when there is nothing to play', () => {
    expect(html).not.toContain('<video')
    expect(html).not.toContain('<img')
    expect(html).toContain('Browser session')
  })

  it('shows the repro steps, failed requests and console', () => {
    expect(html).toContain('Steps to reproduce')
    expect(html).toContain('Click button “Place order”')
    expect(html).toContain('Network')
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

  it('is still self-contained, and ships only the script the panel needs', () => {
    // A report with no video used to carry no script at all. A sortable, filterable
    // Network table cannot be expressed in CSS, so the rule is now "a script when there
    // is something to drive" — and there is still no *seek* script without a player.
    expectFetchesNothing(html)
    expect(html).toContain("querySelector('.netpanel')")
    expect(html).not.toContain("document.querySelector('video')")
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
    expect(html).not.toContain('<h2>Network</h2>')
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

describe('renderReport — the Network panel', () => {
  const meta = buildMeta({ ...base(), recordingOffsetMs: 20_000 })

  it('shows every request as a table row, successes included', () => {
    const html = renderReport(meta, {
      requests: [req({ atMs: 1000, url: 'https://api.test/ok' }), req({ atMs: 2000, status: 500 })]
    })
    expect(html).toContain('class="panel netpanel"')
    expect(html).toContain('https://api.test/ok')
    expect(html.match(/<tr data-i=/g)).toHaveLength(2)
  })

  it('carries the sort keys and filter haystack the script needs', () => {
    // The script moves markup that is already there rather than rebuilding from JSON,
    // so a row that cannot be sorted or found is a row the panel breaks on.
    const html = renderReport(meta, {
      requests: [req({ atMs: 3000, status: 404, bytes: 678, durationMs: 120, group: 'css' })]
    })
    expect(html).toContain('data-group="css"')
    expect(html).toContain('data-fail="1"')
    expect(html).toContain('data-status="404"')
    expect(html).toContain('data-bytes="678"')
    expect(html).toContain('data-time="120"')
    expect(html).toContain('data-find="https://api.test/thing thing api.test get 404"')
  })

  it('offers only the type chips the capture actually has', () => {
    const html = renderReport(meta, { requests: [req({ group: 'js' }), req({ atMs: 1, group: 'img' })] })
    expect(html).toContain('data-group="js"')
    expect(html).toContain('data-group="img"')
    expect(html).not.toContain('data-group="font"')
  })

  it('seeks the recording from a row, the way a console line already did', () => {
    // 30s of session minus a 20s offset is 10s of video.
    const html = renderReport(meta, { requests: [req({ atMs: 30_000, status: 500 })] })
    expect(html).toContain('data-at="10.000"')
  })

  it('leaves a request with no readable timestamp off the timeline', () => {
    const html = renderReport(meta, { requests: [req({ atMs: null, status: 500 })] })
    expect(html).toContain('&mdash;')
    expect(html).toContain('data-at=""')
  })

  it('opens onto General, response and request headers', () => {
    const html = renderReport(meta, {
      requests: [
        req({
          status: 500,
          serverIp: '10.0.0.1',
          httpVersion: 'h2',
          requestHeaders: [{ name: 'content-type', value: 'application/json' }],
          responseHeaders: [{ name: 'x-request-id', value: 'abc' }],
          redactedHeaders: 3
        })
      ]
    })
    expect(html).toContain('<h4>General</h4>')
    expect(html).toContain('<dt>Remote address</dt><dd>10.0.0.1</dd>')
    expect(html).toContain('<dt>content-type</dt><dd>application/json</dd>')
    expect(html).toContain('<dt>x-request-id</dt><dd>abc</dd>')
    expect(html).toContain('3 headers removed')
  })

  it('lists every measured phase on the Timing tab, and says TLS is not additive', () => {
    const html = renderReport(meta, {
      requests: [
        req({
          status: 500,
          durationMs: 1296,
          timings: { blocked: 4, dns: 1, connect: 584, ssl: 306, send: 1, wait: 700, receive: 6 }
        })
      ]
    })
    expect(html).toContain('Queued / stalled')
    expect(html).toContain('Waiting for response')
    expect(html).toContain('TLS is counted inside the initial connection')
  })

  it('omits a phase the HAR did not measure rather than drawing it as zero', () => {
    const html = renderReport(meta, {
      requests: [
        req({
          status: 500,
          timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 2, wait: 30, receive: 4 }
        })
      ]
    })
    expect(html).not.toContain('DNS lookup')
    expect(html).toContain('Request sent')
  })

  it('explains an empty Response tab instead of showing a blank box', () => {
    // Three different reasons a body is missing, and the pane says which.
    const asset = renderReport(meta, { requests: [req({ status: 200, group: 'js' })] })
    expect(asset).toContain('not for its scripts, styles and images')

    const tooBig = renderReport(meta, { requests: [req({ status: 200, group: 'xhr' })] })
    expect(tooBig).toContain('too large to keep')

    const failed = renderReport(meta, { requests: [req({ status: 500 })] })
    expect(failed).toContain('No response body was captured')

    const withBody = renderReport(meta, { requests: [req({ status: 500, body: '{"e":1}' })] })
    expect(withBody).toContain('<pre class="net-body">{&quot;e&quot;:1}</pre>')
  })

  it('shows the payload that was sent, already redacted', () => {
    const html = renderReport(meta, {
      requests: [
        req({
          method: 'POST',
          payload: { mimeType: 'application/json', params: [{ name: 'email', value: 'a@b.c' }] }
        })
      ]
    })
    expect(html).toContain('<dt>email</dt><dd>a@b.c</dd>')
    const none = renderReport(meta, { requests: [req()] })
    expect(none).toContain('This request had no body.')
  })

  it('summarises what the panel is showing, and names the file that holds the rest', () => {
    const html = renderReport(meta, {
      requests: [req({ bytes: 1024, durationMs: 10 }), req({ atMs: 5000, bytes: 1024, durationMs: 20 })]
    })
    expect(html).toContain('2 requests')
    expect(html).toContain('2.0 KB transferred')
    expect(html).toContain('<code>network.har</code>')
    expect(html).toContain('DevTools → Network')
  })

  it('ships the panel script only when there are requests to drive', () => {
    const withPanel = renderReport(meta, { requests: [req()] })
    expect(withPanel).toContain('.netpanel')
    expect(withPanel).toContain("querySelector('.netpanel')")
    const withoutPanel = renderReport(meta, { console: [{ atMs: 1, level: 'error', text: 'boom' }] })
    expect(withoutPanel).not.toContain("querySelector('.netpanel')")
  })

  it('escapes a header value, which is arbitrary text from a server', () => {
    const html = renderReport(meta, {
      requests: [req({ status: 500, responseHeaders: [{ name: 'x-evil', value: '<img src=x>' }] })]
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x&gt;')
  })

  it('escapes a URL into the data attributes the script reads', () => {
    const html = renderReport(meta, { requests: [req({ url: 'https://api.test/"><script>x</script>' })] })
    expect(html).not.toContain('"><script>x')
  })
})

describe('renderReport — Network and Console as tabs', () => {
  const meta = buildMeta({ ...base(), recordingOffsetMs: 20_000 })
  const both = renderReport(meta, {
    requests: [req({ status: 500 }), req({ atMs: 1 })],
    console: [
      { atMs: 10, level: 'error', text: 'boom' },
      { atMs: 20, level: 'log', text: 'chatter' }
    ]
  })

  it('puts both in one panel with a tab each, counted', () => {
    expect(both).toContain('<nav class="lower-tabs">')
    expect(both).toContain('href="#requests" data-tab="requests">Network<b>2</b>')
    expect(both).toContain('href="#console" data-tab="console">Console<b>2</b>')
  })

  it('drives them from :target, so the summary counts switch tabs as well as scroll', () => {
    // The chips at the top already link to #requests and #console. A checkbox or a
    // script would have needed a second mechanism kept in step with them.
    expect(both).toContain('href="#console"')
    expect(both).toContain('.lower > section:target { display: block; }')
    expect(both).toContain('.lower:not(:has(> section:target)) > section:first-of-type')
  })

  it('skips the tab strip when there is only one of them', () => {
    // The stylesheet carries the .lower-tabs rules either way; only the markup differs.
    const netOnly = renderReport(meta, { requests: [req()] })
    expect(netOnly).toContain('class="panel netpanel"')
    expect(netOnly).not.toContain('<nav class="lower-tabs">')

    const consoleOnly = renderReport(meta, { console: [{ atMs: 1, level: 'error', text: 'boom' }] })
    expect(consoleOnly).toContain('<h2>Console</h2>')
    expect(consoleOnly).not.toContain('<nav class="lower-tabs">')
  })

  it('leaves the steps beside the player and moves everything else below', () => {
    expect(both.indexOf('timeline-col')).toBeLessThan(both.indexOf('lower-tabs'))
    expect(both).not.toContain('<div class="timeline-col"><section class="panel lines console"')
  })
})

describe('renderReport — the single-file export', () => {
  it('points the player at whatever the caller supplies', () => {
    const html = renderReport(buildMeta(base()), {}, { mediaSrc: 'data:video/mp4;base64,AAAA' })
    expect(html).toContain('src="data:video/mp4;base64,AAAA"')
    expect(html).not.toContain('src="snapit-2026-08-22_14-31-07.mp4"')
  })

  it('says where the recording went instead of showing a player that plays nothing', () => {
    const html = renderReport(buildMeta(base()), {}, { mediaSrc: null, mediaOmitted: 'Left it out.' })
    expect(html).not.toContain('<video')
    expect(html).toContain('Left it out.')
  })

  it('claims nothing is seekable once the recording is gone', () => {
    // Every data-at would point at a player that is not on the page.
    const html = renderReport(
      buildMeta({ ...base(), recordingOffsetMs: 0, markers: [{ atMs: 1000, note: 'here' }] }),
      { actions: [{ atMs: 5000, label: 'Click' }] },
      { mediaSrc: null }
    )
    expect(html).not.toContain('data-at')
    expect(html).not.toContain('<script')
  })

  it('lists the attached files and stops claiming they sit beside the page', () => {
    const html = renderReport(
      buildMeta(base()),
      {},
      { attachments: [{ name: 'network.har', bytes: 2048, href: 'data:application/json;base64,AA' }] }
    )
    expect(html).toContain('download="network.har"')
    expect(html).toContain('attached above')
    expect(html).not.toContain('sit beside this page')
  })

  it('names a file it could not attach rather than pretending it never existed', () => {
    const html = renderReport(buildMeta(base()), {}, { attachments: [{ name: 'network.har', bytes: 9e8 }] })
    expect(html).toContain('too large to attach')
    expect(html).not.toContain('download="network.har"')
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
      requests: [req({ method: 'POST', status: 500, url: 'https://api.test/orders' })],
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
    // Chrome paints every failure the same red. A 404 for a favicon and a 500 on the
    // checkout are not the same news, and the report is read by someone triaging.
    const html = renderReport(meta, {
      requests: [
        req({ method: 'POST', status: 500, url: 'https://api.test/orders' }),
        req({ atMs: 1, status: 404, url: 'https://api.test/favicon.ico' })
      ]
    })
    expect(html).toContain('class="bad worst"')
    expect(html).toContain('class="bad"')
  })

  it('moves the highlight down the timeline as the recording plays', () => {
    const html = renderReport(buildMeta({ ...base(), recordingOffsetMs: 0 }), {
      actions: [{ atMs: 1000, label: 'Click' }]
    })
    expect(html).toContain("classList.toggle('now'")
    expect(html.match(/<script>/g)).toHaveLength(1)
  })
})
