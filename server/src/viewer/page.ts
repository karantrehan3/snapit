import { environmentLine, type CaptureManifest } from '@snapit/core/domain/manifest'
import type { Capture } from '@snapit/core/domain/model'

/**
 * The page a share link opens.
 *
 * It frames `report.html` rather than rebuilding it, for the same reason the app's own
 * library window does (ROADMAP M1.8): rebuilding means two renderers for one thing — the
 * sortable network table, the console collapsing, the seek script — kept in step by hand.
 * Framing means the page a recipient sees cannot drift from the file a Share produces,
 * because both come from one `renderReport` call in the desktop app.
 *
 * What the shell adds is the part a bare report cannot have: who captured this, which
 * workspace it belongs to, and the actions that only exist because there is a server —
 * file it, post it, copy the link.
 *
 * Self-contained by the same rule the report follows: no stylesheet, script or font is
 * fetched from anywhere.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}
const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]!)

const duration = (ms: number | null): string => {
  if (ms === null) return '—'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const STYLES = `
:root {
  color-scheme: dark;
  --ink: oklch(96% 0.005 260);
  --ink-dim: oklch(70% 0.012 260);
  --ink-faint: oklch(56% 0.014 260);
  --surface: oklch(17% 0.012 260);
  --surface-raised: oklch(21% 0.014 260);
  --line: oklch(30% 0.016 260);
  --accent: oklch(78% 0.16 82);
  --danger: oklch(66% 0.19 22);
  --space: clamp(1rem, 0.6rem + 1.4vw, 1.75rem);
  --radius: 10px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--sans);
  display: flex;
  flex-direction: column;
}
header {
  border-bottom: 1px solid var(--line);
  background: linear-gradient(oklch(22% 0.015 260), var(--surface));
  padding: var(--space);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space);
  align-items: flex-end;
  justify-content: space-between;
}
.title { min-width: 0; }
.eyebrow {
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0 0 0.35rem;
}
h1 {
  margin: 0;
  font-size: clamp(1.2rem, 1rem + 1.1vw, 1.8rem);
  font-weight: 620;
  letter-spacing: -0.015em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.env { margin: 0.5rem 0 0; font-size: 0.82rem; color: var(--ink-dim); font-family: var(--mono); }
.facts { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.fact { display: flex; flex-direction: column; gap: 0.15rem; }
.fact dt {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.fact dd { margin: 0; font-size: 1.35rem; font-variant-numeric: tabular-nums; font-weight: 600; }
.fact.bad dd { color: var(--danger); }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
button, .link {
  font: inherit;
  font-size: 0.84rem;
  font-weight: 540;
  color: var(--ink);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.5rem 0.85rem;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
}
button:hover, .link:hover { border-color: var(--accent); background: oklch(25% 0.02 260); }
button:active { transform: translateY(1px); }
button:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { flex: 1; min-height: 0; }
iframe { width: 100%; height: 100%; border: 0; display: block; background: oklch(99% 0 0); }
.notice {
  margin: var(--space);
  padding: 0.9rem 1rem;
  border: 1px solid var(--danger);
  border-radius: var(--radius);
  color: var(--ink);
  font-size: 0.9rem;
}
@media (max-width: 640px) { header { align-items: flex-start; } .facts { gap: 1rem; } }
`

const fact = (label: string, value: string, bad = false): string =>
  `<div class="fact${bad ? ' bad' : ''}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`

export type ViewerPageInput = {
  capture: Capture
  manifest: CaptureManifest
  /** Where the framed report is served from. */
  reportUrl: string
  shareUrl: string
  /** Set when the media could not be wired up — the reader should know. */
  warning?: string
}

/**
 * The shell, with the report sandboxed inside it.
 *
 * The sandbox is the security decision in this file, so it is worth stating plainly. A
 * report is arbitrary HTML assembled from somebody's application — its console lines and
 * response bodies are text neither this server nor the desktop app authored. The frame
 * withholds `allow-same-origin`, so the report cannot read this page, cannot reach the
 * API with the viewer's credentials, and gets an opaque origin of its own.
 *
 * `allow-scripts` stays, and that pairing is safe only *because* same-origin is withheld:
 * granting both would let the framed document remove its own sandbox attribute. It stays
 * because the report's clickable timeline — seek the player, highlight the line — is the
 * reason framing beats linking.
 */
export function renderViewerPage(input: ViewerPageInput): string {
  const { capture, manifest } = input
  const counts = manifest.counts

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(capture.title)} — snapit</title>
<meta name="robots" content="noindex, nofollow">
<style>${STYLES}</style>
</head>
<body>
<header>
  <div class="title">
    <p class="eyebrow">snapit capture · ${esc(manifest.kind)}</p>
    <h1>${esc(capture.title)}</h1>
    <p class="env">${esc(environmentLine(manifest))} · ${esc(new Date(manifest.capturedAt).toUTCString())}</p>
  </div>
  <dl class="facts">
    ${fact('Duration', duration(manifest.durationMs))}
    ${fact('Steps', String(counts.actions))}
    ${fact('Console errors', String(counts.consoleErrors), counts.consoleErrors > 0)}
    ${fact('Failed requests', String(counts.failedRequests), counts.failedRequests > 0)}
  </dl>
  <div class="actions">
    <button type="button" id="copy">Copy link</button>
    <a class="link" href="${esc(input.reportUrl)}" target="_blank" rel="noopener">Open report</a>
  </div>
</header>
${input.warning ? `<p class="notice">${esc(input.warning)}</p>` : ''}
<main>
  <iframe
    src="${esc(input.reportUrl)}"
    title="Capture report"
    sandbox="allow-scripts allow-popups allow-downloads"
    referrerpolicy="no-referrer"></iframe>
</main>
<script>
document.getElementById('copy').addEventListener('click', async (event) => {
  const button = event.currentTarget
  try {
    await navigator.clipboard.writeText(${JSON.stringify(input.shareUrl)})
    button.textContent = 'Copied'
  } catch {
    button.textContent = 'Press ⌘C'
  }
  setTimeout(() => { button.textContent = 'Copy link' }, 1600)
})
</script>
</body>
</html>`
}

/** A capture that is not ready, or a link that was revoked. Deliberately says very little. */
export function renderViewerGone(message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not available — snapit</title>
<meta name="robots" content="noindex, nofollow">
<style>${STYLES}
body { align-items: center; justify-content: center; text-align: center; padding: var(--space); }
p { color: var(--ink-dim); max-width: 34ch; line-height: 1.55; }</style>
</head>
<body>
<div>
  <p class="eyebrow">snapit</p>
  <h1>This capture is not available</h1>
  <p>${esc(message)}</p>
</div>
</body></html>`
}
