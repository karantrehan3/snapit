import { actionLabel, type ActionRecord, type SelectorCandidate } from '../collector/actions'

/**
 * Turning a collected session into something worth spending an agent's context on.
 *
 * A real session is hundreds of console lines, a HAR of a few hundred requests, and an
 * ARIA snapshot per action. Handing that over raw would fill a context window with
 * noise and crowd out the actual work, so everything here is compact by default and
 * the detail is fetched one step at a time.
 *
 * Pure, so the compaction rules are testable without a browser or a disk.
 */

/** Long enough to identify a failure, short enough that fifty of them still fit. */
const MAX_TEXT = 300
const DEFAULT_LIMIT = 30

const ERROR_LEVELS = new Set(['error', 'uncaught'])
const WARNING_LEVELS = new Set(['warning', 'warn'])

const clip = (text: string, max = MAX_TEXT): string =>
  text.length <= max ? text : `${text.slice(0, max)}...`

/** `0:07` - every timestamp an agent sees, in the same shape a human would read. */
export function clock(atMs: number): string {
  const total = Math.max(0, Math.floor(atMs / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export type ConsoleInput = { atMs: number; level: string; text: string; url?: string }
export type ConsoleLine = { at: string; level: string; text: string; count: number; url?: string }

/**
 * Errors and warnings only, identical messages collapsed with a count.
 *
 * A loop that logs the same failure four hundred times is one problem, not four
 * hundred; and the info-level chatter around it is almost never why the capture exists.
 */
export function summariseConsole(
  entries: readonly ConsoleInput[],
  opts: { limit?: number; includeAll?: boolean } = {}
): ConsoleLine[] {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const wanted = opts.includeAll
    ? entries
    : entries.filter((e) => ERROR_LEVELS.has(e.level) || WARNING_LEVELS.has(e.level))

  const byMessage = new Map<string, ConsoleLine>()
  for (const e of wanted) {
    const text = clip(e.text ?? '')
    const key = `${e.level} ${text}`
    const seen = byMessage.get(key)
    if (seen) {
      seen.count++
      continue
    }
    byMessage.set(key, {
      at: clock(e.atMs),
      level: e.level,
      text,
      count: 1,
      ...(e.url ? { url: clip(e.url, 200) } : {})
    })
  }

  // Errors before warnings, then in the order they first happened.
  const rank = (l: ConsoleLine): number => (ERROR_LEVELS.has(l.level) ? 0 : 1)
  return [...byMessage.values()].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

export type FailedRequest = { method: string; status: number; url: string; statusText?: string }

type HarEntry = {
  request?: { method?: string; url?: string }
  response?: { status?: number; statusText?: string }
}

/** Server errors and outright failures. A 404 for a favicon is noise; a 500 is the bug. */
export function summariseFailedRequests(har: unknown, limit = DEFAULT_LIMIT): FailedRequest[] {
  const entries = (har as { log?: { entries?: HarEntry[] } })?.log?.entries
  if (!Array.isArray(entries)) return []
  return entries
    .filter((e) => {
      const status = e.response?.status
      return typeof status === 'number' && (status === 0 || status >= 400)
    })
    .slice(0, limit)
    .map((e) => ({
      method: e.request?.method ?? 'GET',
      status: e.response?.status ?? 0,
      url: clip(e.request?.url ?? '', 300),
      ...(e.response?.statusText ? { statusText: e.response.statusText } : {})
    }))
}

export type StepLine = { step: number; at: string; did: string }

/**
 * One line per action - no selectors, no snapshot. This is the list an agent reads to
 * decide which two or three steps are worth asking about in detail.
 */
export function summariseSteps(actions: readonly ActionRecord[], limit = 100): StepLine[] {
  return actions.slice(0, limit).map((a, i) => ({ step: i + 1, at: clock(a.atMs), did: actionLabel(a) }))
}

export type StepDetail = {
  step: number
  at: string
  type: string
  tag: string
  value?: string
  /** Ranked best-first; a generator takes the first it can disambiguate. */
  selectors: SelectorCandidate[]
  /** What the page looked like once the action settled - where assertions come from. */
  ariaAfter?: string
}

export function stepDetail(actions: readonly ActionRecord[], step: number): StepDetail | null {
  const action = actions[step - 1]
  if (!action) return null
  return {
    step,
    at: clock(action.atMs),
    type: action.type,
    tag: action.tag,
    ...(action.value !== undefined ? { value: action.value } : {}),
    selectors: action.selectors,
    ...(action.ariaAfter ? { ariaAfter: action.ariaAfter } : {})
  }
}
