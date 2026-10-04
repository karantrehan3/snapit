import { isErrorLevel } from './levels'
import { str } from '../untrusted'
import type { ConsoleEntry, NavigationEntry } from './session'

/**
 * Turning CDP events relayed by the browser extension into a session.
 *
 * The extension attaches `chrome.debugger` and forwards raw protocol events; everything
 * about what they *mean* is decided here, in the app, where it is tested. That split is
 * deliberate — an extension updates on Chrome's release schedule and a desktop app does
 * not, so any rule living in both is a rule that will disagree with itself.
 *
 * The three console sources are the awkward part and the reason `levels.ts` exists:
 * `Runtime.consoleAPICalled` carries a level, `Log.entryAdded` carries a different
 * vocabulary for the same thing, and `Runtime.exceptionThrown` carries none at all and is
 * stamped here. The old collector learned this through playwright's page events; reading
 * it from CDP directly means reading all three.
 *
 * Pure: relayed messages in, a session's non-HAR halves out. Every value arrived over a
 * loopback socket from an extension, so nothing is trusted.
 */

/** What the extension posts. `atMs` is relative to the capture's start, stamped there. */
export type RelayedEvent = { method: string; params: unknown; atMs: number }

/** The shape `chrome-har` consumes, which is the same one the old collector built. */
export type HarMessage = { method: string; params: unknown }

export type RelayedSession = {
  console: ConsoleEntry[]
  navigations: NavigationEntry[]
  /** Network and Page events only, in arrival order. */
  harMessages: HarMessage[]
}

/** A chatty page must not exhaust memory. Mirrors the old collector's cap. */
const MAX_CONSOLE_ENTRIES = 5000

const NETWORK_PREFIX = 'Network.'
const PAGE_PREFIX = 'Page.'

const obj = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

/**
 * `console.log('a', 1, {b:2})` arrives as an array of remote objects, not a string.
 *
 * `description` is what CDP fills in for anything that is not a primitive — an Error's
 * stack, a DOM node's markup — and is the part worth keeping. `value` covers the
 * primitives. Falling back to the type name means an unrenderable argument still shows
 * that *something* was logged there rather than vanishing.
 */
function argText(arg: unknown): string {
  const a = obj(arg)
  if (typeof a.value === 'string') return a.value
  if (a.value !== undefined && a.value !== null) return String(a.value)
  const described = str(a.description)
  if (described) return described
  return str(a.type, 'object')
}

const joinArgs = (args: unknown): string => (Array.isArray(args) ? args : []).map(argText).join(' ').trim()

/**
 * The URL a console line came from, when CDP says.
 *
 * `stackTrace.callFrames[0]` is where the call was made, which is more useful than the
 * script the logger happens to live in.
 */
function originOf(params: Record<string, unknown>): { url?: string; line?: number } {
  const frame = obj(
    obj(params.stackTrace).callFrames instanceof Array
      ? (obj(params.stackTrace).callFrames as unknown[])[0]
      : undefined
  )
  const url = str(frame.url) || str(params.url)
  const line = typeof frame.lineNumber === 'number' ? frame.lineNumber + 1 : undefined
  return { ...(url ? { url } : {}), ...(line !== undefined ? { line } : {}) }
}

export function collectRelayed(events: readonly RelayedEvent[]): RelayedSession {
  const console: ConsoleEntry[] = []
  const navigations: NavigationEntry[] = []
  const harMessages: HarMessage[] = []

  const pushConsole = (entry: ConsoleEntry): void => {
    // Drop the oldest rather than the newest: the tail is what the bug is in.
    if (console.length >= MAX_CONSOLE_ENTRIES) console.shift()
    console.push(entry)
  }

  for (const event of events) {
    const { method, atMs } = event
    const params = obj(event.params)

    if (method.startsWith(NETWORK_PREFIX) || method.startsWith(PAGE_PREFIX)) {
      harMessages.push({ method, params: event.params })
    }

    switch (method) {
      case 'Runtime.consoleAPICalled': {
        const text = joinArgs(params.args)
        if (text) pushConsole({ atMs, level: str(params.type, 'log'), text, ...originOf(params) })
        break
      }
      case 'Log.entryAdded': {
        const entry = obj(params.entry)
        const text = str(entry.text)
        if (text) {
          pushConsole({
            atMs,
            level: str(entry.level, 'log'),
            text,
            ...(str(entry.url) ? { url: str(entry.url) } : {}),
            ...(typeof entry.lineNumber === 'number' ? { line: entry.lineNumber + 1 } : {})
          })
        }
        break
      }
      case 'Runtime.exceptionThrown': {
        const details = obj(params.exceptionDetails)
        // CDP gives an exception no level, so it is stamped here — `levels.ts` documents
        // why `uncaught` is a level the readers have to know about.
        const text = str(obj(details.exception).description) || str(details.text) || 'Uncaught exception'
        pushConsole({ atMs, level: 'uncaught', text, ...originOf(details) })
        break
      }
      case 'Page.frameNavigated': {
        const frame = obj(params.frame)
        // Sub-frames navigate constantly; only the main frame is somewhere the tester went.
        if (frame.parentId === undefined) {
          const url = str(frame.url)
          if (/^https?:/.test(url)) navigations.push({ atMs, url })
        }
        break
      }
      default:
        break
    }
  }

  return { console, navigations, harMessages }
}

/** Whether a relayed session saw anything worth reporting as a finding. */
export const hasErrors = (session: RelayedSession): boolean =>
  session.console.some((c) => isErrorLevel(c.level))
