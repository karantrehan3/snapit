import { humanBytes, humanDuration, type CaptureMeta } from './bundle'
import { REPORT_STYLES } from './reportStyles'
import { isFailedStatus } from './collector/har'
import { isErrorLevel, isNotableLevel } from './collector/levels'
import { networkPanel } from './reportNetwork'
import { NETWORK_SCRIPT } from './reportNetworkScript'
import { keepMostTelling, type ReportRequest } from './reportRequests'

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

export type ReportConsoleLine = { atMs: number; level: string; text: string }
export type ReportAction = { atMs: number; label: string }

export type ReportData = {
  console?: ReportConsoleLine[]
  actions?: ReportAction[]
  /** Every request the collector saw, not only the failures. See `reportRequests.ts`. */
  requests?: ReportRequest[]
}

/**
 * One of the bundle's sibling files, carried inside the page instead of beside it.
 * `href` is a data URI; without one the file was too large to inline and is named
 * anyway, because a reader should know what exists rather than what fitted.
 */
export type ReportAttachment = { name: string; bytes: number; href?: string }

export type ReportOptions = {
  /**
   * What the media element points at. Defaults to the media's bare filename, which is
   * correct inside a bundle folder; the single-file export passes a data URI. `null`
   * leaves the media out altogether — see `standalone.ts`, where a recording too large
   * to inline is dropped rather than silently producing an unsendable file.
   */
  mediaSrc?: string | null
  /** Why the media is missing, when it was left out on purpose. */
  mediaOmitted?: string
  /** Downloadable copies of the sibling JSON, for a page with no folder around it. */
  attachments?: ReportAttachment[]
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
function stamp(atMs: number | null, seek: number | null): string {
  // A dash rather than 0:00: an entry whose clock could not be read has no place on the
  // timeline, and putting it at the start would be a claim rather than an absence.
  const label = atMs === null ? '&mdash;' : escapeHtml(humanDuration(atMs))
  return seek === null
    ? `<span class="at">${label}</span>`
    : `<button type="button" class="at" data-at="${seek.toFixed(3)}">${label}</button>`
}

function mediaTag(meta: CaptureMeta, opts: ReportOptions): string {
  if (!meta.media) return ''
  if (opts.mediaSrc === null) {
    const why = opts.mediaOmitted ?? 'The recording is not in this file.'
    return `<p class="panel absent">${escapeHtml(why)}</p>`
  }
  const src = escapeHtml(opts.mediaSrc ?? meta.media.file)
  const isVideo = VIDEO_EXTS.includes(meta.media.ext)
  const tag = isVideo
    ? `<video controls preload="metadata" src="${src}"></video>`
    : `<img src="${src}" alt="Screen capture" />`
  return `<figure>${tag}${isVideo ? markerRail(meta) : ''}</figure>`
}

/**
 * Where a marker sits along the recording, as a percentage.
 *
 * Clamped, because a marker at exactly the end would otherwise hang half off the rail,
 * and one past the end (a duration that disagrees with the file, which happens when the
 * front of a recording was trimmed) would leave the pin somewhere off screen.
 */
export function pinPercent(atMs: number, durationMs: number): number {
  if (!Number.isFinite(atMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0
  return Math.min(100, Math.max(0, (atMs / durationMs) * 100))
}

/**
 * The markers, on the recording rather than beside it.
 *
 * The list in the aside says when each one is and seeks to it, which is the part that
 * works when there is no video. What it cannot show is *where* they are — whether the
 * three of them are spread across four minutes or bunched in the last ten seconds — and
 * that is the shape of the recording someone is about to watch. Every player people
 * already use draws them on the timeline for that reason.
 *
 * A rail of its own rather than marks on the native scrubber, because a `<video controls>`
 * has no timeline this page can reach. Building a whole player to get one would mean
 * owning play, volume, fullscreen and keyboard for the sake of some pins, in a document
 * that is also handed to other people as a file — so the native controls keep the
 * playing and this keeps the pointing. It scrubs as well, because a track under a
 * playhead that does not respond to a click reads as broken.
 */
function markerRail(meta: CaptureMeta): string {
  const markers = meta.capture.markers
  const duration = meta.capture.durationMs
  if (markers.length === 0 || duration === null || duration <= 0) return ''
  const pins = markers
    .map((m) => {
      const label = m.note.trim() || humanDuration(m.atMs)
      // `data-at` is what the seek script already looks for; `data-pin` is how the same
      // script knows this one is on the rail and highlights the pin rather than its row.
      return (
        `<button type="button" class="pin" data-pin data-at="${(m.atMs / 1000).toFixed(3)}"` +
        ` style="left:${pinPercent(m.atMs, duration).toFixed(3)}%"` +
        ` title="${escapeHtml(`${humanDuration(m.atMs)} — ${label}`)}"` +
        ` aria-label="${escapeHtml(`Marker at ${humanDuration(m.atMs)}: ${label}`)}"></button>`
      )
    })
    .join('')
  return (
    `<div class="rail" data-rail data-duration="${(duration / 1000).toFixed(3)}"` +
    ` role="group" aria-label="Markers">` +
    `<span class="rail-fill" data-fill></span>${pins}</div>`
  )
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

type SectionOptions = {
  /** A control rendered under the heading — the problems-only checkbox. */
  extra?: string
  /** The sibling file holding the rows this list had to drop. */
  source?: string
}

/**
 * A section built from a capped list, or nothing at all when the list is empty.
 * `id` is the anchor the summary bar jumps to.
 */
function listSection(id: string, title: string, items: string[], opts: SectionOptions = {}): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, MAX_ROWS)
  const dropped = items.length - shown.length
  // Naming the file works whether it sits beside this page or is attached to it: the
  // single-file export carries the same names.
  const more =
    dropped > 0
      ? `<li class="more">… ${dropped} more, see ${escapeHtml(opts.source || 'the JSON beside this file')}</li>`
      : ''
  return (
    `<section class="panel lines ${id}" id="${id}">` +
    `<h2>${escapeHtml(title)}</h2>${opts.extra ?? ''}` +
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
 * The one script this page carries, and only when there is a video to justify it.
 *
 * Three jobs, all of them the same job: keep the page and the frame on screen agreed.
 * Clicking a timestamp seeks the player, playback moves the highlight down each timeline
 * (which is why the media column sticks — the list follows the frame), and the marker
 * rail under the player tracks the playhead and scrubs.
 *
 * The message listener is the fourth, and it only ever does anything inside snapit: the
 * app frames this page in a sandbox with no shared origin, so `postMessage` is the only
 * channel there is, and the marker editor beside the frame needs to seek the player and
 * ask where the playhead is. In a report someone has been sent — a file, not framed —
 * nothing posts to it and the listener never fires.
 */
const SEEK_SCRIPT = `<script>
(function () {
  var video = document.querySelector('video')
  if (!video) return
  var groups = new Map()
  var pins = []
  Array.prototype.slice.call(document.querySelectorAll('button[data-at]')).forEach(function (mark) {
    mark.addEventListener('click', function () {
      video.currentTime = Number(mark.getAttribute('data-at'))
      video.play()
      // On one column the player is above the timeline and scrolls out of reach, and a
      // seek nobody can see is not a seek. 'nearest' does nothing when it is already on
      // screen, which is the whole of the two-column case.
      video.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    // A pin's siblings on the rail are the other pins, so the row highlighting below
    // would fight over one shared parent. It highlights itself instead.
    if (mark.hasAttribute('data-pin')) {
      pins.push(mark)
      return
    }
    var section = mark.closest('section')
    if (!groups.has(section)) groups.set(section, [])
    groups.get(section).push(mark)
  })

  var rail = document.querySelector('[data-rail]')
  var fill = rail && rail.querySelector('[data-fill]')
  var railDuration = rail ? Number(rail.getAttribute('data-duration')) : 0
  if (rail) {
    rail.addEventListener('click', function (event) {
      // A pin's own click already seeked; this is the track between them.
      if (event.target !== rail && event.target !== fill) return
      var box = rail.getBoundingClientRect()
      if (box.width <= 0 || !railDuration) return
      var ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
      video.currentTime = ratio * railDuration
    })
  }

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
    if (fill && railDuration) {
      fill.style.width = Math.min(100, (video.currentTime / railDuration) * 100) + '%'
    }
    var passed = null
    pins.forEach(function (pin) {
      if (Number(pin.getAttribute('data-at')) <= video.currentTime) passed = pin
    })
    pins.forEach(function (pin) {
      pin.classList.toggle('now', pin === passed)
    })
  })

  window.addEventListener('message', function (event) {
    // Only the window that framed this page, and only the two shapes it may ask for.
    if (event.source !== window.parent || window.parent === window) return
    var msg = event.data
    if (!msg || msg.snapit !== 'seek' && msg.snapit !== 'where') return
    if (msg.snapit === 'seek') {
      video.currentTime = Math.max(0, Number(msg.atSec) || 0)
      video.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
    window.parent.postMessage({ snapit: 'at', atSec: video.currentTime }, '*')
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
  return listSection('steps', 'Steps to reproduce', items, { source: 'actions.json' })
}

/**
 * The chatter filter, shared by the console and the network list.
 *
 * A checkbox and a sibling selector, with no script behind it: a session with no video
 * has to ship no JavaScript at all, and a control that needs some would break that for
 * the two lists most likely to need one.
 */
function problemFilter(hidden: number): string {
  if (hidden <= 0) return ''
  return (
    `<label class="filter"><input type="checkbox" checked />` +
    `<span>Problems only <em>(${hidden} hidden)</em></span></label>`
  )
}

function severityClass(level: string): string {
  if (isErrorLevel(level)) return 'sev-error'
  return isWarningOnly(level) ? 'sev-warn' : 'sev-mute'
}

const isWarningOnly = (level: string): boolean => isNotableLevel(level) && !isErrorLevel(level)

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
  const notable = collapsed.filter((l) => isNotableLevel(l.level))
  const items = collapsed.map((l) => {
    const times = l.count > 1 ? `<span class="times">×${l.count}</span>` : ''
    return (
      `<li class="${severityClass(l.level)}">${stamp(l.atMs, videoTimeSec(l.atMs, offsetMs))}` +
      `<span class="lvl">${escapeHtml(l.level)}</span>` +
      `<span class="text">${escapeHtml(l.text)}</span>${times}</li>`
    )
  })
  // No filter when there is nothing to filter down to — an empty list is worse than the
  // chatter.
  const filter = notable.length > 0 ? problemFilter(collapsed.length - notable.length) : ''
  return listSection('console', 'Console', items, { extra: filter, source: 'console.json' })
}

/**
 * Network and Console, as two tabs over one panel.
 *
 * `:target` rather than a checkbox or a script, for one reason worth the CSS: the counts
 * in the summary bar are already links to `#requests` and `#console`, so with `:target`
 * driving the tabs those links keep working and now switch to the right one on the way.
 * A radio input would have needed a second mechanism to stay in step with them.
 *
 * The first pane shows when nothing is targeted, which is how the page opens.
 */
function lowerTabs(network: string, console_: string, counts: { requests: number; console: number }): string {
  if (!network && !console_) return ''
  if (!network || !console_) return network || console_
  const tab = (href: string, label: string, count: number): string =>
    `<a href="#${href}" data-tab="${href}">${escapeHtml(label)}<b>${count}</b></a>`
  return (
    `<div class="lower">` +
    `<nav class="lower-tabs">` +
    tab('requests', 'Network', counts.requests) +
    tab('console', 'Console', counts.console) +
    `</nav>${network}${console_}</div>`
  )
}

/**
 * The sibling files, carried inside the page.
 *
 * Only the single-file export has these. A bundle's report says the JSON is beside it
 * because it is; a page that has been emailed somewhere has no beside, and the HAR is
 * the half of a bug report a developer actually opens in another tool.
 */
function attachmentsSection(attachments: ReportAttachment[] | undefined): string {
  if (!attachments?.length) return ''
  const items = attachments
    .map((a) => {
      // The href is a data URI built from base64, whose alphabet holds nothing HTML
      // treats specially — the name beside it is arbitrary and is escaped.
      const label = a.href
        ? `<a download="${escapeHtml(a.name)}" href="${a.href}">${escapeHtml(a.name)}</a>`
        : `<span class="url">${escapeHtml(a.name)}</span>`
      const size = a.href ? humanBytes(a.bytes) : `${humanBytes(a.bytes)} — too large to attach`
      return `<li>${label}<span class="times">${escapeHtml(size)}</span></li>`
    })
    .join('')
  return (
    `<section class="panel lines files"><h2>Attached data</h2>` +
    `<ol>${items}</ol>` +
    `<p class="facts">Saved from this page — nothing is fetched.</p></section>`
  )
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

/**
 * The last line, which has to stay true in both shapes. Inside a bundle the JSON is
 * beside the page; in a single file it is attached to it, and saying otherwise would
 * send a reader looking through a folder that does not exist.
 */
function footerText(opts: ReportOptions): string {
  const where = opts.attachments?.length
    ? 'the full console, network and action data are attached above'
    : 'the full console, network and action data sit beside this page as JSON'
  return `Everything in this report came from this machine. Credentials were stripped before it was written; ${where}.`
}

export function renderReport(meta: CaptureMeta, data: ReportData = {}, opts: ReportOptions = {}): string {
  const isSession = meta.capture.kind === 'browser-session'
  // A recording left out of a single-file export is not seekable, and nothing may claim
  // otherwise: every data-at on the page would point at a player that is not there.
  const media = opts.mediaSrc === null ? null : meta.media
  const seekable = media !== null && VIDEO_EXTS.includes(media.ext)
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

  const errorCount = collapseConsole(data.console ?? []).filter((l) => isErrorLevel(l.level)).length
  const failed = data.requests?.filter((r) => isFailedStatus(r.status)).length ?? 0
  const stats: Stat[] = [
    { id: 'console', count: errorCount, label: `console error${errorCount === 1 ? '' : 's'}`, bad: true },
    { id: 'requests', count: failed, label: `failed request${failed === 1 ? '' : 's'}`, bad: true },
    { id: 'steps', count: data.actions?.length ?? 0, label: 'steps', bad: false },
    { id: 'markers', count: meta.capture.markers.length, label: 'markers', bad: false }
  ]
  const wentWrong = errorCount + failed > 0

  const timeline = stepsSection(data.actions, offsetMs)
  /*
   * Network and Console share the full width of the page below the two columns, one tab
   * each. Both are things a reader works in rather than scans, both want more room than
   * half a page, and only one is being read at a time.
   *
   * The cost is that the console no longer sits beside the player. The seek buttons still
   * work — the script scrolls the video back into view — but it is a jump rather than a
   * glance, which is the trade the tabs buy.
   */
  const network = networkPanel(keepMostTelling(data.requests ?? [], MAX_ROWS), (atMs) =>
    videoTimeSec(atMs, offsetMs)
  )
  const lower = lowerTabs(network, consoleSection(data.console, offsetMs), {
    requests: data.requests?.length ?? 0,
    console: collapseConsole(data.console ?? []).length
  })
  // Markers ride with the player rather than the timeline: they are already on the
  // video's clock, they are the one list the person recording wrote themselves, and a
  // recording whose only context is its markers then needs no second column at all.
  const markers = markerSection(meta, seekable)

  // Environment opens by default only when it is the whole story; beside a timeline it
  // is reference material, and reference material should not be the first thing read.
  const env =
    `<details class="panel env"${timeline ? '' : ' open'}><summary>Environment</summary>` +
    `<table><tbody>${rows}</tbody></table></details>`
  const aside = `${mediaTag(meta, opts)}${markers}${env}${attachmentsSection(opts.attachments)}`
  // With nothing on a timeline there is no second column to justify — a plain recording
  // gets its media at a readable width instead of half a page of white space.
  const body =
    (timeline
      ? `<div class="split"><div class="media-col">${aside}</div>` +
        `<div class="timeline-col">${timeline}</div></div>`
      : `<div class="solo">${aside}</div>`) + lower

  const file = meta.media ? ` · ${meta.media.file}` : ''
  const when = `${new Date(meta.capturedAt).toLocaleString()} · ${humanDuration(meta.capture.durationMs)}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${REPORT_STYLES}</style>
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
  <footer>${escapeHtml(footerText(opts))}</footer>
</main>
${seekable ? SEEK_SCRIPT : ''}${network ? NETWORK_SCRIPT : ''}
</body>
</html>
`
}
