import { humanBytes, humanDuration, type CaptureMeta } from './bundle'

/**
 * Renders a capture bundle's `report.html`: the recording, and the context needed
 * to act on it, in one file that opens in any browser.
 *
 * Self-contained by rule — no stylesheet, script, font or image may be fetched from
 * anywhere. A bug report has to survive being copied to a machine with no network
 * (and often no trust), and the media sits next to it in the same folder.
 *
 * Pure: takes metadata, returns a string. No fs, no electron.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Escape for HTML text and quoted attributes alike. Window titles are arbitrary text. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

const VIDEO_EXTS = ['mp4', 'webm']

function mediaTag(meta: CaptureMeta): string {
  const src = escapeHtml(meta.media.file)
  if (VIDEO_EXTS.includes(meta.media.ext)) {
    return `<video controls preload="metadata" src="${src}"></video>`
  }
  return `<img src="${src}" alt="Screen capture" />`
}

/**
 * The marker list, and the only script this page carries: clicking a marker seeks
 * the player. Inline and dependency-free — the self-containment rule is about not
 * reaching the network, which this does not.
 */
function markerSection(meta: CaptureMeta): string {
  const markers = meta.capture.markers
  if (markers.length === 0) return ''
  const seekable = VIDEO_EXTS.includes(meta.media.ext)
  const items = markers
    .map((m) => {
      const label = escapeHtml(humanDuration(m.atMs))
      const note = m.note ? `<span class="note">${escapeHtml(m.note)}</span>` : ''
      return seekable
        ? `<li><button type="button" data-at="${(m.atMs / 1000).toFixed(3)}">${label}</button>${note}</li>`
        : `<li><span class="at">${label}</span>${note}</li>`
    })
    .join('')
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
  return `<section class="panel marks"><h2>Markers</h2><ol>${items}</ol></section>${script}`
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
}

function displayRows(meta: CaptureMeta): string {
  return meta.displays
    .map((d) => {
      const size = `${d.bounds.width}×${d.bounds.height} @ ${d.scaleFactor}x`
      return row(d.isPrimary ? `${d.label} (primary)` : d.label, size)
    })
    .join('')
}

export function renderReport(meta: CaptureMeta): string {
  const source = meta.capture.source
  const captured = new Date(meta.capturedAt)
  const rows = [
    row('Captured', captured.toLocaleString()),
    row('Duration', humanDuration(meta.capture.durationMs)),
    source ? row('Source', `${source.name} (${source.type})`) : '',
    row('System audio', meta.capture.hasSystemAudio ? 'recorded' : 'not recorded'),
    meta.capture.markers.length > 0 ? row('Markers', String(meta.capture.markers.length)) : '',
    row('File', `${meta.media.file} · ${humanBytes(meta.media.bytes)}`),
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
<title>${escapeHtml(meta.media.file)}</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #ffffff; --edge: #dfe3e8;
    --ink: #14181d; --ink-2: #5a6472; --accent: #d8362b;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1216; --card: #171b21; --edge: #2a3138;
      --ink: #e9ecf1; --ink-2: #a6b0bc; --accent: #ff5c4e;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 60rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
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
  footer { color: var(--ink-2); font-size: 12px; }
  .marks { padding: .9rem; }
  .marks h2 { margin: 0 0 .6rem; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
  .marks ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .3rem; }
  .marks li { display: flex; align-items: baseline; gap: .6rem; }
  .marks button, .marks .at {
    font: 500 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--accent); background: none; border: 1px solid var(--edge);
    border-radius: 3px; padding: .1rem .4rem; cursor: pointer;
  }
  .marks .at { cursor: default; }
  .marks button:hover { border-color: var(--accent); }
  .marks .note { color: var(--ink-2); }
</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(meta.media.file)}</h1>
    <span class="tag">snapit capture</span>
  </header>
  <figure>${mediaTag(meta)}</figure>
  <div class="panel"><table><tbody>${rows}</tbody></table></div>
  ${markerSection(meta)}
  <footer>Everything in this report came from this machine. The media file sits beside this page in the same folder.</footer>
</main>
</body>
</html>
`
}
