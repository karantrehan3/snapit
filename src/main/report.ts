import { humanBytes, humanDuration, type CaptureMeta } from './bundle'

/**
 * Renders a capture bundle's `report.html`: the capture, and the context needed to act
 * on it, in one file that opens in any browser.
 *
 * Self-contained by rule — no stylesheet, script, font or image may be fetched from
 * anywhere. A bug report has to survive being copied to a machine with no network (and
 * often no trust), and its media sits next to it in the same folder. The one inline
 * script is marker seeking, which reaches nothing.
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

export type ReportConsoleLine = { atMs: number; level: string; text: string }
export type ReportAction = { atMs: number; label: string }
export type ReportRequest = { method: string; status: number; url: string }

export type ReportData = {
  console?: ReportConsoleLine[]
  actions?: ReportAction[]
  failedRequests?: ReportRequest[]
}

const VIDEO_EXTS = ['mp4', 'webm']

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

/** A section built from a capped list, or nothing at all when the list is empty. */
function listSection(title: string, items: string[], className = ''): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, MAX_ROWS)
  const more =
    items.length > shown.length
      ? `<li class="more">… ${items.length - shown.length} more, see the JSON beside this file</li>`
      : ''
  return `<section class="panel lines ${className}"><h2>${escapeHtml(title)}</h2><ol>${shown.join('')}${more}</ol></section>`
}

const time = (atMs: number): string => escapeHtml(humanDuration(atMs))

function markerSection(meta: CaptureMeta): string {
  const markers = meta.capture.markers
  if (markers.length === 0) return ''
  const seekable = meta.media !== null && VIDEO_EXTS.includes(meta.media.ext)
  const items = markers.map((m) => {
    const note = m.note ? `<span class="note">${escapeHtml(m.note)}</span>` : ''
    return seekable
      ? `<li><button type="button" data-at="${(m.atMs / 1000).toFixed(3)}">${time(m.atMs)}</button>${note}</li>`
      : `<li><span class="at">${time(m.atMs)}</span>${note}</li>`
  })
  const script = seekable
    ? `<script>
document.querySelectorAll('button[data-at]').forEach(function (b) {
  b.addEventListener('click', function () {
    var v = document.querySelector('video')
    if (!v) return
    v.currentTime = Number(b.getAttribute('data-at'))
    v.play()
  })
})
</script>`
    : ''
  return `${listSection('Markers', items, 'marks')}${script}`
}

function stepsSection(actions: ReportAction[] | undefined): string {
  if (!actions?.length) return ''
  const items = actions.map(
    (a) => `<li><span class="at">${time(a.atMs)}</span><span>${escapeHtml(a.label)}</span></li>`
  )
  return listSection('Steps to reproduce', items, 'steps')
}

function consoleSection(lines: ReportConsoleLine[] | undefined): string {
  if (!lines?.length) return ''
  // Errors first: a hundred info lines must not bury the one that matters.
  const rank = (l: ReportConsoleLine): number =>
    l.level === 'uncaught' || l.level === 'error' ? 0 : l.level === 'warning' ? 1 : 2
  const items = [...lines]
    .sort((a, b) => rank(a) - rank(b) || a.atMs - b.atMs)
    .map(
      (l) =>
        `<li class="lvl-${escapeHtml(l.level)}"><span class="at">${time(l.atMs)}</span>` +
        `<span class="lvl">${escapeHtml(l.level)}</span><span>${escapeHtml(l.text)}</span></li>`
    )
  return listSection('Console', items, 'console')
}

function requestsSection(requests: ReportRequest[] | undefined): string {
  if (!requests?.length) return ''
  const items = requests.map(
    (r) =>
      `<li><span class="lvl">${escapeHtml(String(r.status || 'failed'))}</span>` +
      `<span class="at">${escapeHtml(r.method)}</span><span class="url">${escapeHtml(r.url)}</span></li>`
  )
  return listSection('Failed requests', items, 'requests')
}

export function renderReport(meta: CaptureMeta, data: ReportData = {}): string {
  const isSession = meta.capture.kind === 'browser-session'
  const title = meta.media ? meta.media.file : 'Browser session'
  const source = meta.capture.source
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
    meta.capture.markers.length > 0 ? row('Markers', String(meta.capture.markers.length)) : '',
    row('Platform', `${meta.system.platform} ${meta.system.release} (${meta.system.arch})`),
    row('Locale', `${meta.system.locale} · ${meta.system.timeZone}`),
    row('snapit', meta.app.version),
    displayRows(meta)
  ].join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #ffffff; --edge: #dfe3e8;
    --ink: #14181d; --ink-2: #5a6472; --accent: #d8362b; --warn: #b26a00;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1216; --card: #171b21; --edge: #2a3138;
      --ink: #e9ecf1; --ink-2: #a6b0bc; --accent: #ff5c4e; --warn: #e0a33c;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 62rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem 1rem; }
  h1 { margin: 0; font-size: 1.15rem; font-weight: 600; letter-spacing: -.01em; }
  .tag {
    font: 500 11px ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .08em; text-transform: uppercase;
    color: var(--accent); border: 1px solid var(--accent);
    border-radius: 3px; padding: .1rem .4rem;
  }
  figure { margin: 0; background: #000; border: 1px solid var(--edge); border-radius: 8px; overflow: hidden; }
  video, img { display: block; width: 100%; height: auto; max-height: 75vh; object-fit: contain; }
  .panel { background: var(--card); border: 1px solid var(--edge); border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .6rem .9rem; border-bottom: 1px solid var(--edge); vertical-align: top; }
  tr:last-child th, tr:last-child td { border-bottom: 0; }
  th { font-weight: 500; color: var(--ink-2); white-space: nowrap; width: 1%; }
  td { font-variant-numeric: tabular-nums; }
  .lines { padding: .9rem; }
  .lines h2 { margin: 0 0 .6rem; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
  .lines ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .35rem; }
  .lines li { display: flex; align-items: baseline; gap: .6rem; }
  .lines .more { color: var(--ink-2); font-size: 12px; }
  .at, .lvl, .lines button {
    font: 500 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .at { color: var(--ink-2); }
  .lvl { color: var(--ink-2); text-transform: uppercase; font-size: 11px; }
  .lvl-error .lvl, .lvl-uncaught .lvl { color: var(--accent); }
  .lvl-warning .lvl { color: var(--warn); }
  .requests .lvl { color: var(--accent); }
  .url { word-break: break-all; }
  .marks button, .marks .at {
    color: var(--accent); background: none; border: 1px solid var(--edge);
    border-radius: 3px; padding: .1rem .4rem; cursor: pointer;
  }
  .marks .at { cursor: default; }
  .marks button:hover { border-color: var(--accent); }
  .note { color: var(--ink-2); }
  footer { color: var(--ink-2); font-size: 12px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <span class="tag">${isSession ? 'browser session' : 'snapit capture'}</span>
  </header>
  ${mediaTag(meta)}
  <div class="panel"><table><tbody>${rows}</tbody></table></div>
  ${stepsSection(data.actions)}
  ${requestsSection(data.failedRequests)}
  ${consoleSection(data.console)}
  ${markerSection(meta)}
  <footer>Everything in this report came from this machine. Credentials were stripped before it was written; the full console, network and action data sit beside this page as JSON.</footer>
</main>
</body>
</html>
`
}
