import { humanBytes, humanDuration, type CaptureMeta } from './bundle'

/**
 * Renders a capture bundle's `report.html`: the capture, and the context needed to act
 * on it, in one file that opens in any browser.
 *
 * Self-contained by rule — no stylesheet, script, font or image may be fetched from
 * anywhere. A bug report has to survive being copied to a machine with no network (and
 * often no trust), and its media sits next to it in the same folder.
 *
 * The layout is two columns because of one interaction: a timestamp is only worth
 * clicking if the player it seeks is still on screen. The media column sticks, the
 * timeline scrolls beside it, and playback moves a highlight down that timeline — so
 * the list follows the frame rather than the reader having to. On one column the media
 * sticks to the top instead.
 *
 * Pure: takes metadata and the collected lines, returns a string. No fs, no electron.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Escape for HTML text and quoted attributes alike. All of this is arbitrary text. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** Long lists are truncated rather than turning the report into a wall. */
const MAX_ROWS = 200

const ERROR_LEVELS = new Set(['error', 'uncaught'])
const WARNING_LEVELS = new Set(['warning', 'warn'])

export type ReportConsoleLine = { atMs: number; level: string; text: string }
export type ReportAction = { atMs: number; label: string }
export type ReportRequest = { method: string; status: number; url: string; body?: string }

export type ReportData = {
  console?: ReportConsoleLine[]
  actions?: ReportAction[]
  failedRequests?: ReportRequest[]
}

const VIDEO_EXTS = ['mp4', 'webm']

/**
 * Where a session-clock moment lands in the recording, or null when the recording had
 * not started yet. Negative offsets are fine: they mean the recording started first.
 */
export function videoTimeSec(sessionMs: number, recordingOffsetMs: number | undefined): number | null {
  if (recordingOffsetMs === undefined) return null
  const ms = sessionMs - recordingOffsetMs
  return ms >= 0 ? ms / 1000 : null
}

export type CollapsedLine = ReportConsoleLine & { count: number }

/**
 * Identical messages become one line with a count.
 *
 * A loop logging the same failure four hundred times is one problem, and four hundred
 * copies of it push everything else past the row cap. The first timestamp is kept, so
 * the line seeks to where the problem started rather than where it gave up.
 */
export function collapseConsole(lines: readonly ReportConsoleLine[]): CollapsedLine[] {
  const byMessage = new Map<string, CollapsedLine>()
  for (const line of lines) {
    const key = `${line.level} ${line.text}`
    const seen = byMessage.get(key)
    if (seen) seen.count++
    else byMessage.set(key, { ...line, count: 1 })
  }
  return [...byMessage.values()]
}

/** A timestamp, as a button that seeks the recording when there is one to seek. */
function stamp(atMs: number, seek: number | null): string {
  const label = escapeHtml(humanDuration(atMs))
  return seek === null
    ? `<span class="at">${label}</span>`
    : `<button type="button" class="at" data-at="${seek.toFixed(3)}">${label}</button>`
}

function mediaTag(meta: CaptureMeta): string {
  if (!meta.media) return ''
  const src = escapeHtml(meta.media.file)
  const tag = VIDEO_EXTS.includes(meta.media.ext)
    ? `<video controls preload="metadata" src="${src}"></video>`
    : `<img src="${src}" alt="Screen capture" />`
  return `<figure>${tag}</figure>`
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
}

function displayRows(meta: CaptureMeta): string {
  return meta.displays
    .map((d) =>
      row(
        d.isPrimary ? `${d.label} (primary)` : d.label,
        `${d.bounds.width}×${d.bounds.height} @ ${d.scaleFactor}x`
      )
    )
    .join('')
}

/**
 * A section built from a capped list, or nothing at all when the list is empty.
 * `id` is the anchor the summary bar jumps to.
 */
function listSection(id: string, title: string, items: string[], extra = ''): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, MAX_ROWS)
  const more =
    items.length > shown.length
      ? `<li class="more">… ${items.length - shown.length} more, see the JSON beside this file</li>`
      : ''
  return (
    `<section class="panel lines ${id}" id="${id}">` +
    `<h2>${escapeHtml(title)}</h2>${extra}` +
    `<ol>${shown.join('')}${more}</ol></section>`
  )
}

function markerSection(meta: CaptureMeta, seekable: boolean): string {
  const markers = meta.capture.markers
  if (markers.length === 0) return ''
  // Markers are stamped by the recorder, so they are already on the video's clock.
  const items = markers.map((m) => {
    const note = m.note ? `<span class="note">${escapeHtml(m.note)}</span>` : ''
    return `<li>${stamp(m.atMs, seekable ? m.atMs / 1000 : null)}${note}</li>`
  })
  return listSection('markers', 'Markers', items)
}

/**
 * The one script this page carries, and only when there is a video to justify it:
 * clicking a timestamp seeks the player, and playback moves the highlight down each
 * timeline. That second half is why the media column sticks — the list stays correlated
 * to the frame on screen.
 */
const SEEK_SCRIPT = `<script>
(function () {
  var video = document.querySelector('video')
  if (!video) return
  var groups = new Map()
  Array.prototype.slice.call(document.querySelectorAll('button[data-at]')).forEach(function (mark) {
    mark.addEventListener('click', function () {
      video.currentTime = Number(mark.getAttribute('data-at'))
      video.play()
      // On one column the player is above the timeline and scrolls out of reach, and a
      // seek nobody can see is not a seek. 'nearest' does nothing when it is already on
      // screen, which is the whole of the two-column case.
      video.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    var section = mark.closest('section')
    if (!groups.has(section)) groups.set(section, [])
    groups.get(section).push(mark)
  })
  video.addEventListener('timeupdate', function () {
    groups.forEach(function (items) {
      var current = null
      items.forEach(function (mark) {
        if (Number(mark.getAttribute('data-at')) <= video.currentTime) current = mark
      })
      items.forEach(function (mark) {
        mark.parentElement.classList.toggle('now', mark === current)
      })
    })
  })
})()
</script>`

function stepsSection(actions: ReportAction[] | undefined, offsetMs: number | undefined): string {
  if (!actions?.length) return ''
  const items = actions.map(
    (a, i) =>
      `<li><span class="n">${i + 1}</span>${stamp(a.atMs, videoTimeSec(a.atMs, offsetMs))}` +
      `<span class="did">${escapeHtml(a.label)}</span></li>`
  )
  return listSection('steps', 'Steps to reproduce', items)
}

/** 5xx is the bug, 4xx is usually the symptom, 0 is the request that never landed. */
function statusClass(status: number): string {
  return status === 0 || status >= 500 ? 'sev-error' : 'sev-warn'
}

function severityClass(level: string): string {
  if (ERROR_LEVELS.has(level)) return 'sev-error'
  return WARNING_LEVELS.has(level) ? 'sev-warn' : 'sev-mute'
}

/**
 * Console output, chronological, with everything below warning hidden behind a filter
 * that starts on.
 *
 * It used to sort errors to the top so chatter could not bury them. That worked, at the
 * cost of the ordering that makes a console readable beside a video — the line above is
 * no longer what happened before. Hiding chatter solves the burying without breaking the
 * timeline, and unticking the box puts every line back where it happened rather than in
 * a pile at the bottom.
 */
function consoleSection(lines: ReportConsoleLine[] | undefined, offsetMs: number | undefined): string {
  if (!lines?.length) return ''
  const collapsed = collapseConsole(lines).sort((a, b) => a.atMs - b.atMs)
  const notable = collapsed.filter((l) => ERROR_LEVELS.has(l.level) || WARNING_LEVELS.has(l.level))
  const items = collapsed.map((l) => {
    const times = l.count > 1 ? `<span class="times">×${l.count}</span>` : ''
    return (
      `<li class="${severityClass(l.level)}">${stamp(l.atMs, videoTimeSec(l.atMs, offsetMs))}` +
      `<span class="lvl">${escapeHtml(l.level)}</span>` +
      `<span class="text">${escapeHtml(l.text)}</span>${times}</li>`
    )
  })
  // No filter when there is nothing to filter down to — an empty list is worse than the
  // chatter. It is a CSS-only checkbox, so a session with no video still needs no script.
  const hidden = collapsed.length - notable.length
  const filter =
    notable.length > 0 && hidden > 0
      ? `<label class="filter"><input type="checkbox" checked />` +
        `<span>Problems only <em>(${hidden} hidden)</em></span></label>`
      : ''
  return listSection('console', 'Console', items, filter)
}

function requestsSection(requests: ReportRequest[] | undefined): string {
  if (!requests?.length) return ''
  const items = requests.map(
    (r) =>
      `<li class="${statusClass(r.status)}">` +
      `<span class="lvl">${escapeHtml(String(r.status || 'failed'))}</span>` +
      `<span class="at">${escapeHtml(r.method)}</span>` +
      `<span class="text"><span class="url">${escapeHtml(r.url)}</span>` +
      // The body of a 500 is usually the actual reason; a URL alone rarely is.
      (r.body ? `<span class="body">${escapeHtml(r.body)}</span>` : '') +
      `</span></li>`
  )
  return listSection('requests', 'Failed requests', items)
}

type Stat = { id: string; count: number; label: string; bad: boolean }

/**
 * The counts, as the first thing read and as the jump list.
 *
 * A reader arrives wanting to know what went wrong, not what the display's scale factor
 * was. These say it in one line, and each one is an anchor — so the summary and the
 * navigation are the same object rather than two bars competing for the same job.
 */
function summaryBar(stats: Stat[]): string {
  const present = stats.filter((s) => s.count > 0)
  if (present.length === 0) return ''
  const links = present
    .map(
      (s) => `<a href="#${s.id}"${s.bad ? ' class="bad"' : ''}><b>${s.count}</b> ${escapeHtml(s.label)}</a>`
    )
    .join('')
  return `<nav class="summary">${links}</nav>`
}

const STYLES = `
  :root {
    --bg: #f5f6f8; --card: #ffffff; --edge: #e3e7ec; --rule: #eef1f5;
    --ink: #10151b; --ink-2: #5a6472; --ink-3: #8c95a3;
    --err: #c4342a; --err-soft: rgba(196, 52, 42, 0.08);
    --warn: #96650b; --warn-soft: rgba(150, 101, 11, 0.09);
    --focus: #0a6ed1;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e1116; --card: #161a20; --edge: #262c34; --rule: #1e242b;
      --ink: #e9ecf1; --ink-2: #a3adba; --ink-3: #767f8c;
      --err: #ff6a5c; --err-soft: rgba(255, 106, 92, 0.11);
      --warn: #e3a53f; --warn-soft: rgba(227, 165, 63, 0.11);
      --focus: #4c9dff;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.75rem 1.25rem 5rem; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 78rem; margin: 0 auto; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

  header { margin-bottom: 1.25rem; }
  .kicker {
    display: flex; align-items: center; gap: .5rem; margin: 0 0 .35rem;
    font: 500 11px var(--mono); letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
  }
  .kicker .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--err); }
  h1 {
    margin: 0; font-size: clamp(1.35rem, 1.1rem + 1vw, 1.9rem); font-weight: 600;
    letter-spacing: -.02em; line-height: 1.15; overflow-wrap: anywhere;
  }
  .when { margin: .3rem 0 0; color: var(--ink-2); font-size: 13px; }

  .summary { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .9rem; }
  .summary a {
    display: inline-flex; align-items: baseline; gap: .35rem; text-decoration: none;
    padding: .3rem .65rem; border: 1px solid var(--edge); border-radius: 999px;
    background: var(--card); color: var(--ink-2); font-size: 12.5px;
  }
  .summary a b { font: 600 14px var(--mono); color: var(--ink); }
  .summary a.bad { border-color: var(--err); background: var(--err-soft); color: var(--err); }
  .summary a.bad b { color: var(--err); }
  .summary a:hover { border-color: var(--ink-3); }

  .split {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 1.25rem; align-items: start;
  }
  .solo { display: grid; gap: 1.25rem; max-width: 52rem; }
  .media-col { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; }
  .timeline-col { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  /*
   * One column: the timeline runs underneath the media rather than beside it, so
   * sticking the whole column would float the markers and the environment table over
   * it. Only the player sticks — it is the one thing a timestamp needs on screen — and
   * it keeps a solid background because it now scrolls over the content below it.
   */
  @media (max-width: 62rem) {
    .split { grid-template-columns: minmax(0, 1fr); }
    .media-col { position: static; }
    .media-col figure { position: sticky; top: .5rem; z-index: 1; }
    .media-col video, .media-col img { max-height: 38vh; }
  }

  figure {
    margin: 0; background: #05070a; border: 1px solid var(--edge); border-radius: 12px;
    overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, .05), 0 12px 28px -18px rgba(0, 0, 0, .5);
  }
  video, img { display: block; width: 100%; height: auto; max-height: 72vh; object-fit: contain; }

  .panel { background: var(--card); border: 1px solid var(--edge); border-radius: 12px; }
  details.env { overflow: hidden; }
  details.env > summary {
    cursor: pointer; padding: .7rem .9rem; list-style: none;
    font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2);
  }
  details.env > summary::-webkit-details-marker { display: none; }
  details.env > summary::after { content: ' \\25BE'; color: var(--ink-3); }
  details.env[open] > summary { border-bottom: 1px solid var(--rule); }
  details.env[open] > summary::after { content: ' \\25B4'; }
  table { border-collapse: collapse; width: 100%; }
  th, td {
    text-align: left; padding: .45rem .9rem; border-bottom: 1px solid var(--rule);
    vertical-align: top; font-size: 13px;
  }
  tr:last-child th, tr:last-child td { border-bottom: 0; }
  th { font-weight: 500; color: var(--ink-2); white-space: nowrap; width: 1%; }
  td { font-variant-numeric: tabular-nums; }

  .lines { padding: .85rem .9rem 1rem; scroll-margin-top: 1rem; }
  .lines h2 {
    margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .09em;
    text-transform: uppercase; color: var(--ink-3);
  }
  .lines ol {
    margin: .55rem 0 0; padding: 0; list-style: none;
    display: flex; flex-direction: column; gap: 1px;
  }
  .lines li {
    display: flex; align-items: baseline; gap: .55rem; padding: .32rem .45rem;
    border-radius: 6px; border-left: 2px solid transparent;
  }
  .lines li:hover { background: var(--rule); }
  .lines .more { color: var(--ink-3); font-size: 12px; }
  .text, .did { min-width: 0; overflow-wrap: anywhere; }
  .n {
    flex: none; min-width: 1.25rem; color: var(--ink-3);
    font: 500 11px var(--mono); font-variant-numeric: tabular-nums;
  }
  .at, .lvl, .times { font: 500 12px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .at { flex: none; color: var(--ink-3); }
  .lvl { flex: none; color: var(--ink-3); text-transform: uppercase; font-size: 10.5px; letter-spacing: .04em; }
  .times { margin-left: auto; color: var(--ink-3); font-size: 11px; }
  .url { display: block; }
  .body {
    display: block; margin-top: .3rem; padding: .4rem .55rem; border-radius: 6px;
    background: var(--rule); color: var(--ink-2); font: 12px var(--mono); white-space: pre-wrap;
  }
  .note { color: var(--ink); }

  /* Severity earns colour; everything else stays quiet so it can be scanned past. */
  .sev-error { background: var(--err-soft); border-left-color: var(--err); }
  .sev-error .lvl { color: var(--err); }
  .sev-error:hover { background: var(--err-soft); }
  .sev-warn { background: var(--warn-soft); border-left-color: var(--warn); }
  .sev-warn .lvl { color: var(--warn); }
  .sev-warn:hover { background: var(--warn-soft); }

  /* The line the playhead is on. */
  .lines li.now { background: var(--rule); border-left-color: var(--focus); }
  .lines li.now .at { color: var(--focus); }

  button.at {
    color: var(--ink-2); background: transparent; border: 1px solid var(--edge);
    border-radius: 5px; padding: .05rem .35rem; cursor: pointer; font-size: 11.5px;
  }
  button.at:hover { border-color: var(--focus); color: var(--focus); }

  .filter {
    display: inline-flex; align-items: center; gap: .4rem; margin-top: .4rem;
    color: var(--ink-2); font-size: 12px; cursor: pointer; user-select: none;
  }
  .filter em { color: var(--ink-3); font-style: normal; }
  /* CSS-only, so a report with no video still carries no script at all. */
  .console:has(.filter input:checked) li.sev-mute { display: none; }

  footer { margin-top: 1.5rem; color: var(--ink-3); font-size: 12px; max-width: 52rem; }
`

export function renderReport(meta: CaptureMeta, data: ReportData = {}): string {
  const isSession = meta.capture.kind === 'browser-session'
  const seekable = meta.media !== null && VIDEO_EXTS.includes(meta.media.ext)
  // Only convert onto the video clock when there is a video to seek.
  const offsetMs = seekable ? meta.capture.recordingOffsetMs : undefined
  const source = meta.capture.source
  // What was captured, not what the file is called. The filename is the least useful
  // thing on the page and it was the largest — the window or page under test is the
  // thing a reader is looking for. The name is still one row down, in Environment.
  const title = source ? source.name : isSession ? 'Browser session' : (meta.media?.file ?? 'Capture')
  const c = meta.collected

  const rows = [
    row('Captured', new Date(meta.capturedAt).toLocaleString()),
    row('Duration', humanDuration(meta.capture.durationMs)),
    source ? row('Source', `${source.name} (${source.type})`) : '',
    isSession ? '' : row('System audio', meta.capture.hasSystemAudio ? 'recorded' : 'not recorded'),
    meta.media ? row('File', `${meta.media.file} · ${humanBytes(meta.media.bytes)}`) : '',
    c
      ? row(
          'Collected',
          `${c.consoleErrors} console errors · ${c.failedRequests} failed of ${c.requests} requests · ${c.actions} actions`
        )
      : '',
    row('Platform', `${meta.system.platform} ${meta.system.release} (${meta.system.arch})`),
    row('Locale', `${meta.system.locale} · ${meta.system.timeZone}`),
    row('snapit', meta.app.version),
    displayRows(meta)
  ].join('')

  const errorCount = collapseConsole(data.console ?? []).filter((l) => ERROR_LEVELS.has(l.level)).length
  const failed = data.failedRequests?.length ?? 0
  const stats: Stat[] = [
    { id: 'console', count: errorCount, label: `console error${errorCount === 1 ? '' : 's'}`, bad: true },
    { id: 'requests', count: failed, label: `failed request${failed === 1 ? '' : 's'}`, bad: true },
    { id: 'steps', count: data.actions?.length ?? 0, label: 'steps', bad: false },
    { id: 'markers', count: meta.capture.markers.length, label: 'markers', bad: false }
  ]
  const wentWrong = errorCount + failed > 0

  const timeline = [
    stepsSection(data.actions, offsetMs),
    requestsSection(data.failedRequests),
    consoleSection(data.console, offsetMs)
  ].join('')
  // Markers ride with the player rather than the timeline: they are already on the
  // video's clock, they are the one list the person recording wrote themselves, and a
  // recording whose only context is its markers then needs no second column at all.
  const markers = markerSection(meta, seekable)

  // Environment opens by default only when it is the whole story; beside a timeline it
  // is reference material, and reference material should not be the first thing read.
  const env =
    `<details class="panel env"${timeline ? '' : ' open'}><summary>Environment</summary>` +
    `<table><tbody>${rows}</tbody></table></details>`
  const aside = `${mediaTag(meta)}${markers}${env}`
  // With nothing on a timeline there is no second column to justify — a plain recording
  // gets its media at a readable width instead of half a page of white space.
  const body = timeline
    ? `<div class="split"><div class="media-col">${aside}</div>` +
      `<div class="timeline-col">${timeline}</div></div>`
    : `<div class="solo">${aside}</div>`

  const file = meta.media ? ` · ${meta.media.file}` : ''
  const when = `${new Date(meta.capturedAt).toLocaleString()} · ${humanDuration(meta.capture.durationMs)}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header>
    <p class="kicker">${wentWrong ? '<span class="dot"></span>' : ''}${isSession ? 'browser session' : 'snapit capture'}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="when">${escapeHtml(when)}${escapeHtml(file)}</p>
    ${summaryBar(stats)}
  </header>
  ${body}
  <footer>Everything in this report came from this machine. Credentials were stripped before it was written; the full console, network and action data sit beside this page as JSON.</footer>
</main>
${seekable ? SEEK_SCRIPT : ''}
</body>
</html>
`
}
