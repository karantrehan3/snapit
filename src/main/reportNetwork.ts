import { humanBytes, humanDuration } from './bundle'
import { isFailedStatus } from './collector/har'
import type { HeaderPair, ReportRequest, RequestTimings } from './reportRequests'

/**
 * The report's Network panel.
 *
 * A list of failures answered "what broke" and nothing else. What a person actually does
 * with a captured session is the thing Chrome's Network tab is for: sort by duration to
 * find the slow one, narrow to Fetch/XHR to skip the fonts, click a row and read the
 * headers, check whether the preflight went out before the request that needed it. So
 * this is that panel, rendered from the same HAR, in a file that has to open with no
 * network and no snapit.
 *
 * It is not a reimplementation of DevTools and could not be — there is no live page to
 * re-issue a request against, no filmstrip, no throttling. What it has is what the HAR
 * holds. Where the HAR holds nothing, the pane says so rather than showing a blank box:
 * response bodies in particular exist only for failures, because that is all the
 * collector fetches.
 *
 * Pure: markup in, string out. `reportNetworkScript.ts` carries the behaviour, and
 * everything it needs is in `data-` attributes on the rows it moves around.
 */

/** Chrome's own chips, in Chrome's order, because a reader knows this row already. */
const GROUP_LABELS: [string, string][] = [
  ['all', 'All'],
  ['xhr', 'Fetch/XHR'],
  ['doc', 'Doc'],
  ['css', 'CSS'],
  ['js', 'JS'],
  ['font', 'Font'],
  ['img', 'Img'],
  ['media', 'Media'],
  ['ws', 'WS'],
  ['other', 'Other']
]

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c])

/** The seven phases the Timing tab lists, in the order they happen. */
const PHASE_ROWS: [keyof RequestTimings, string][] = [
  ['blocked', 'Queued / stalled'],
  ['dns', 'DNS lookup'],
  ['connect', 'Initial connection'],
  ['ssl', 'TLS handshake'],
  ['send', 'Request sent'],
  ['wait', 'Waiting for response'],
  ['receive', 'Content download']
]

function kv(pairs: readonly HeaderPair[]): string {
  return pairs.map((p) => `<dt>${esc(p.name)}</dt><dd>${esc(p.value)}</dd>`).join('')
}

function headersSheet(r: ReportRequest): string {
  const general: HeaderPair[] = [
    { name: 'Request URL', value: r.url },
    { name: 'Request method', value: r.method },
    { name: 'Status code', value: r.statusText ? `${r.status} ${r.statusText}` : String(r.status || '—') },
    ...(r.serverIp ? [{ name: 'Remote address', value: r.serverIp }] : []),
    ...(r.httpVersion ? [{ name: 'Protocol', value: r.httpVersion }] : []),
    ...(r.priority ? [{ name: 'Priority', value: r.priority }] : []),
    ...(r.initiator ? [{ name: 'Initiator', value: r.initiator }] : [])
  ]
  const stripped =
    r.redactedHeaders > 0
      ? `<p class="net-note">${r.redactedHeaders} header${r.redactedHeaders === 1 ? '' : 's'} ` +
        `removed before this was written — cookies, tokens and authorization.</p>`
      : ''
  const section = (title: string, pairs: readonly HeaderPair[]): string =>
    pairs.length === 0 ? '' : `<h4>${esc(title)}</h4><dl class="kv">${kv(pairs)}</dl>`
  return (
    `<div data-sheet="headers">` +
    section('General', general) +
    section('Response headers', r.responseHeaders) +
    section('Request headers', r.requestHeaders) +
    stripped +
    `</div>`
  )
}

function payloadSheet(r: ReportRequest): string {
  const payload = r.payload
  if (!payload) {
    return `<div data-sheet="payload" hidden><p class="net-note">This request had no body.</p></div>`
  }
  const type = payload.mimeType ? `<h4>${esc(payload.mimeType)}</h4>` : ''
  const params = payload.params.length > 0 ? `<dl class="kv">${kv(payload.params)}</dl>` : ''
  const text = payload.text ? `<pre class="net-body">${esc(payload.text)}</pre>` : ''
  return `<div data-sheet="payload" hidden>${type}${params}${text}</div>`
}

function responseSheet(r: ReportRequest): string {
  if (r.body) {
    return `<div data-sheet="response" hidden><pre class="net-body">${esc(r.body)}</pre></div>`
  }
  // Saying why beats an empty box that looks like a bug. See `wantsBody` in
  // `collector/har.ts` for the rule this is explaining.
  const programmatic = r.group === 'xhr'
  const why = isFailedStatus(r.status)
    ? 'No response body was captured for this request.'
    : programmatic
      ? 'This response was too large to keep — bodies over 32 KB are left out, since the ' +
        'HAR is meant to be readable rather than complete.'
      : 'Bodies are kept for the calls an application makes on purpose, not for its ' +
        'scripts, styles and images: those are most of the bytes and none of the bug.'
  return `<div data-sheet="response" hidden><p class="net-note">${esc(why)}</p></div>`
}

function timingSheet(r: ReportRequest): string {
  const t = r.timings
  if (!t) {
    return `<div data-sheet="timing" hidden><p class="net-note">This request was not timed.</p></div>`
  }
  const measured = PHASE_ROWS.filter(([key]) => t[key] >= 0)
  const total = measured.reduce((sum, [key]) => sum + t[key], 0)
  const rows = measured
    .map(([key, label]) => {
      const value = t[key]
      const width = total > 0 ? (value / total) * 100 : 0
      return (
        `<tr><th scope="row">${esc(label)}</th>` +
        `<td class="net-phase"><span class="net-phase-bar phase-${key}" style="width:${width.toFixed(2)}%"></span></td>` +
        `<td class="net-phase-ms">${value.toFixed(2)} ms</td></tr>`
      )
    })
    .join('')
  // TLS is reported inside the connection time, so the column does not add up without
  // saying so — the same trap that would inflate every HTTPS bar in the waterfall.
  const note =
    t.ssl >= 0 ? `<p class="net-note">TLS is counted inside the initial connection, not added to it.</p>` : ''
  return (
    `<div data-sheet="timing" hidden><table class="net-timing"><tbody>${rows}` +
    `<tr class="net-total"><th scope="row">Total</th><td></td>` +
    `<td class="net-phase-ms">${(r.durationMs ?? total).toFixed(0)} ms</td></tr>` +
    `</tbody></table>${note}</div>`
  )
}

function detailPane(r: ReportRequest, index: number): string {
  return (
    `<div class="net-pane" data-for="${index}" hidden>` +
    headersSheet(r) +
    payloadSheet(r) +
    responseSheet(r) +
    timingSheet(r) +
    `</div>`
  )
}

/** Everything the filter box searches, lowercased once here rather than on every keystroke. */
const haystack = (r: ReportRequest): string =>
  [r.url, r.name, r.domain, r.method, String(r.status), r.resourceType, r.initiator, r.mimeType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

/** A timestamp the existing seek script will pick up, when there is a video to seek. */
function seekCell(r: ReportRequest, videoSec: number | null): string {
  if (r.atMs === null) return `<td class="net-at"><span class="at">&mdash;</span></td>`
  const label = esc(humanDuration(r.atMs))
  const stamp =
    videoSec === null
      ? `<span class="at">${label}</span>`
      : `<button type="button" class="at" data-at="${videoSec.toFixed(3)}">${label}</button>`
  return `<td class="net-at">${stamp}</td>`
}

/**
 * The bar itself is placed by the script, which is the only thing that knows how wide
 * the visible span is. All that is rendered here is the title, because a three-pixel bar
 * has to be able to say what it stands for.
 */
function waterfallCell(r: ReportRequest): string {
  if (r.atMs === null) return ''
  const p = r.phases
  const title = p
    ? `${humanDuration(r.atMs)} · ${p.beforeMs} ms connecting · ${p.waitMs} ms waiting · ${p.receiveMs} ms downloading`
    : `${humanDuration(r.atMs)}${r.durationMs === undefined ? '' : ` · ${r.durationMs} ms`}`
  return `<span class="net-bar" title="${esc(title)}"></span>`
}

/** 5xx is the bug, 4xx is usually the symptom, 0 is the request that never landed. */
function severity(status: number): string {
  if (!isFailedStatus(status)) return ''
  return status === 0 || status >= 500 ? ' class="bad worst"' : ' class="bad"'
}

function row(r: ReportRequest, index: number, videoSec: number | null): string {
  const failed = isFailedStatus(r.status)
  const attrs = [
    `data-i="${index}"`,
    `data-group="${esc(r.group)}"`,
    `data-fail="${failed ? 1 : 0}"`,
    `data-name="${esc(r.name.toLowerCase())}"`,
    `data-status="${r.status}"`,
    `data-initiator="${esc((r.initiator ?? '').toLowerCase())}"`,
    `data-bytes="${r.bytes ?? 0}"`,
    `data-time="${r.durationMs ?? 0}"`,
    `data-at="${r.atMs ?? ''}"`,
    `data-dur="${r.durationMs ?? 0}"`,
    `data-find="${esc(haystack(r))}"`
  ].join(' ')
  return (
    `<tr ${attrs}${severity(r.status)}>` +
    seekCell(r, videoSec) +
    `<td class="net-name"><span class="n">${esc(r.name)}</span>` +
    (r.domain ? `<span class="d">${esc(r.domain)}</span>` : '') +
    `</td>` +
    `<td class="net-status">${esc(String(r.status || 'failed'))}</td>` +
    `<td class="net-type">${esc(r.resourceType ?? r.group)}</td>` +
    `<td class="net-init">${esc(r.initiatorType ?? '')}</td>` +
    `<td class="net-size">${r.bytes === undefined ? '' : esc(humanBytes(r.bytes))}</td>` +
    `<td class="net-time">${r.durationMs === undefined ? '' : `${r.durationMs} ms`}</td>` +
    `<td class="net-wf">${waterfallCell(r)}</td>` +
    `</tr>`
  )
}

/**
 * The whole panel.
 *
 * `videoTimeFor` converts a session moment onto the recording's clock, or returns null
 * when there is nothing to seek — the caller owns that conversion because it is the one
 * thing here that depends on whether a recording exists.
 */
export function networkPanel(
  requests: readonly ReportRequest[],
  videoTimeFor: (atMs: number) => number | null
): string {
  if (requests.length === 0) return ''

  const chips = GROUP_LABELS.filter(([id]) => id === 'all' || requests.some((r) => r.group === id))
    .map(
      ([id, label]) =>
        `<button type="button" data-group="${id}"${id === 'all' ? ' class="on"' : ''}>${esc(label)}</button>`
    )
    .join('')

  const rows = requests.map((r, i) => row(r, i, r.atMs === null ? null : videoTimeFor(r.atMs))).join('')
  const panes = requests.map(detailPane).join('')

  const transferred = requests.reduce((sum, r) => sum + (r.bytes ?? 0), 0)
  const failures = requests.filter((r) => isFailedStatus(r.status)).length
  const finish = Math.max(0, ...requests.map((r) => (r.atMs ?? 0) + (r.durationMs ?? 0)))

  const headers = [
    ['at', 'At'],
    ['name', 'Name'],
    ['status', 'Status'],
    ['group', 'Type'],
    ['initiator', 'Initiator'],
    ['bytes', 'Size'],
    ['time', 'Time']
  ]
    .map(([key, label]) => `<th data-sort="${key}" data-dir="">${esc(label)}</th>`)
    .join('')

  return (
    `<section class="panel netpanel" id="requests">` +
    `<div class="net-toolbar">` +
    `<input type="search" class="net-find" placeholder="Filter URL, status, type" aria-label="Filter requests" />` +
    `<div class="net-types">${chips}</div>` +
    `<label class="net-fails"><input type="checkbox"${failures > 0 ? '' : ' disabled'} /> Failures only</label>` +
    `</div>` +
    `<div class="net-split">` +
    `<div class="net-list"><table class="net-table">` +
    `<thead><tr>${headers}<th class="net-wf-head">Waterfall</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>` +
    `<aside class="net-detail" hidden>` +
    `<div class="net-tabs">` +
    `<button type="button" data-tab="headers" class="on">Headers</button>` +
    `<button type="button" data-tab="payload">Payload</button>` +
    `<button type="button" data-tab="response">Response</button>` +
    `<button type="button" data-tab="timing">Timing</button>` +
    `<button type="button" class="net-close" aria-label="Close">&times;</button>` +
    `</div>` +
    `<div class="net-panes">${panes}</div>` +
    `</aside></div>` +
    `<p class="net-foot"><span class="net-count">${requests.length} requests</span> · ` +
    `${esc(humanBytes(transferred))} transferred · finished at ${esc(humanDuration(finish))} · ` +
    `the whole HAR is in <code>network.har</code>, which opens in DevTools → Network</p>` +
    `</section>`
  )
}
