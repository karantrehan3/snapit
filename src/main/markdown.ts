import { humanDuration, type CaptureMeta } from './bundle'
import { clock, type ConsoleLine, type FailedRequest, type StepLine } from './mcp/summarise'

/**
 * A capture bundle as Markdown, for pasting into a ticket, a pull request or a chat.
 *
 * This is deliberately the whole integration story. snapit does not talk to Jira,
 * Linear or Slack: whoever is filing the ticket is already authenticated to it, and a
 * paste costs them one keystroke against an OAuth flow and a token to keep alive here.
 *
 * Pure: metadata and summarised lines in, one string out.
 */

export type MarkdownInput = {
  bundleName: string
  meta: CaptureMeta
  steps?: StepLine[]
  failedRequests?: FailedRequest[]
  console?: ConsoleLine[]
}

/**
 * Wrap as inline code. Backticks inside would end the span early and spill raw text
 * into the document, so they are swapped rather than escaped — no renderer disagrees
 * about an apostrophe.
 */
const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``

/** Keep a one-line field on one line, whatever the page put in it. */
const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

function section(title: string, body: string): string {
  return body.length > 0 ? `\n## ${title}\n\n${body}\n` : ''
}

function stepsBlock(steps: StepLine[] | undefined): string {
  if (!steps?.length) return ''
  return steps.map((s) => `${s.step}. (${s.at}) ${flat(s.did)}`).join('\n')
}

function requestsBlock(requests: FailedRequest[] | undefined): string {
  if (!requests?.length) return ''
  return requests
    .map((r) => {
      const status = code(`${r.method} ${r.status || 'failed'}`)
      const detail = r.statusText ? ` — ${flat(r.statusText)}` : ''
      // Indented under the bullet rather than inline: a body is often long enough to
      // swamp the status it belongs to.
      const body = r.body ? `\n  - ${code(flat(r.body))}` : ''
      return `- ${status} ${code(flat(r.url))}${detail}${body}`
    })
    .join('\n')
}

/**
 * Console output goes in a fenced block: it is arbitrary text from someone else's
 * application, and a fence is the one container that needs no escaping at all.
 */
function consoleBlock(lines: ConsoleLine[] | undefined): string {
  if (!lines?.length) return ''
  const body = lines
    .map((l) => {
      const times = l.count > 1 ? ` (x${l.count})` : ''
      return `${l.at.padEnd(6)}${l.level.padEnd(10)}${flat(l.text)}${times}`
    })
    .join('\n')
  return `\`\`\`\n${body}\n\`\`\``
}

function markersBlock(meta: CaptureMeta): string {
  const markers = meta.capture.markers
  if (markers.length === 0) return ''
  return markers.map((m) => `- ${clock(m.atMs)}${m.note ? ` — ${flat(m.note)}` : ''}`).join('\n')
}

export function bundleMarkdown(input: MarkdownInput): string {
  const { meta, bundleName } = input
  const isSession = meta.capture.kind === 'browser-session'
  const source = meta.capture.source

  const facts = [
    `**When** ${new Date(meta.capturedAt).toLocaleString()}`,
    `**Duration** ${humanDuration(meta.capture.durationMs)}`,
    source ? `**Source** ${flat(source.name)}` : '',
    `**Platform** ${meta.system.platform} ${meta.system.release} (${meta.system.arch})`,
    `**snapit** ${meta.app.version}`
  ].filter(Boolean)

  const displays = meta.displays
    .map((d) => `${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}x`)
    .join(', ')

  return (
    `# ${isSession ? 'Browser session' : 'Screen capture'} — ${bundleName}\n\n` +
    `${facts.join(' · ')}\n` +
    (displays ? `\n**Displays** ${displays}\n` : '') +
    section('Steps to reproduce', stepsBlock(input.steps)) +
    section('Failed requests', requestsBlock(input.failedRequests)) +
    section('Console', consoleBlock(input.console)) +
    section('Markers', markersBlock(meta)) +
    `\n---\n\nCaptured locally with snapit; credentials were stripped before writing. ` +
    (meta.media ? `Recording and full data` : `Full console, network and action data`) +
    ` in ${code(bundleName)}.\n`
  )
}
