import type { LibraryEntry } from '@preload/index'

/**
 * How a capture reads in the library.
 *
 * Pure, and unit-tested, because every one of these is a decision that looks trivial
 * and is not: what counts as "today" depends on the reader's clock, not on elapsed
 * hours, and a list of timestamped filenames is unreadable without the grouping.
 */

const DAY_MS = 86_400_000

/** Midnight local time — the boundary people mean by "yesterday", not 24 hours ago. */
const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * `Today`, `Yesterday`, a weekday inside the last week, then a date.
 *
 * The weekday band exists because "Tuesday" is how someone refers to a capture they
 * made three days ago; past a week it stops being a useful handle and the date is.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Unknown date'
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })
  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

export const timeLabel = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * `18 minutes ago`. For the Overview, where the question is how long ago rather than
 * when.
 *
 * A clock reading was actively misleading there: "1:39" sat two columns from durations
 * like "0:36" and read as one. Elapsed time cannot be confused with a length, and it is
 * the more useful answer on a landing surface anyway.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.round((now.getTime() - then) / 1000)
  if (secs < 0) return 'just now'
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  // Past a week the date is the useful handle, which is `dayLabel`'s whole argument.
  return dayLabel(iso, now)
}

export type DayGroup = { label: string; entries: LibraryEntry[] }

/**
 * Consecutive runs, not a bucket per distinct day — the list arrives sorted, so a run
 * is the group, and this cannot reorder anything by accident.
 */
export function groupByDay(entries: readonly LibraryEntry[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const label = dayLabel(entry.capturedAt, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }
  return groups
}

/** `1.4 MB` — exact bytes are noise when the question is "can I delete this". */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** `1:04`, or nothing at all — a screenshot has no duration and should not claim one. */
export function humanDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return ''
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export const KIND_LABEL: Record<LibraryEntry['kind'], string> = {
  screenshot: 'Screenshot',
  recording: 'Recording',
  session: 'Web session'
}

export const hasFindings = (e: LibraryEntry): boolean => e.consoleErrors > 0 || e.failedRequests > 0

/**
 * Only the facts a capture actually has. A screenshot with no duration and no steps
 * should say "240 KB", not carry three empty fields to keep the columns even.
 *
 * Separate from `metaLine` because the detail pane names the kind in a label of its own
 * beside this, and "RECORDING · Recording · 0:58" is what happens when both do it.
 */
export function metaFacts(entry: LibraryEntry): string {
  return [
    humanDuration(entry.durationMs),
    entry.steps > 0 ? `${entry.steps} step${entry.steps === 1 ? '' : 's'}` : '',
    entry.markers > 0 ? `${entry.markers} marker${entry.markers === 1 ? '' : 's'}` : '',
    humanBytes(entry.bytes)
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The line under a capture's name in the list: what it is, then what it has. */
export function metaLine(entry: LibraryEntry): string {
  return [KIND_LABEL[entry.kind], metaFacts(entry)].filter(Boolean).join(' · ')
}

/**
 * The same facts for a tile, split across two lines.
 *
 * A tile is about 212px wide, which is not enough for `metaLine` — it truncated mid-way
 * through the size and dropped the time entirely. So: what it is and how long it runs
 * first, then the details you only want once you have found it.
 */
export function tileFacts(entry: LibraryEntry): { what: string; detail: string } {
  return {
    what: [
      KIND_LABEL[entry.kind],
      humanDuration(entry.durationMs),
      entry.steps > 0 ? `${entry.steps} step${entry.steps === 1 ? '' : 's'}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    detail: [
      timeLabel(entry.capturedAt),
      humanBytes(entry.bytes),
      entry.markers > 0 ? `${entry.markers} marker${entry.markers === 1 ? '' : 's'}` : ''
    ]
      .filter(Boolean)
      .join(' · ')
  }
}

/**
 * What the library can be narrowed to.
 *
 * `problems` is the question the list exists to answer, so it stays first. The rest are
 * what a capture *is*, because the folder holds four different objects — a recording, a
 * GIF, a still, and a browser session that happens to contain a recording — and when you
 * are looking for one of them the other three are noise.
 */
export type Filter = 'all' | 'problems' | 'recording' | 'gif' | 'screenshot' | 'session'

export const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  problems: 'Problems',
  recording: 'Videos',
  gif: 'GIFs',
  screenshot: 'Shots',
  session: 'Web'
}

/** The chip order. `all` and `problems` lead; the kinds follow in the order they matter. */
export const FILTER_ORDER: Filter[] = ['all', 'problems', 'recording', 'gif', 'screenshot', 'session']

const extensionOf = (path: string | null): string => {
  const tail = (path ?? '').toLowerCase().split('/').pop() ?? ''
  const dot = tail.lastIndexOf('.')
  return dot === -1 ? '' : tail.slice(dot + 1)
}

/**
 * A GIF is a recording as far as the library is concerned — `kindFor` only separates
 * stills — so the container is the only thing that can tell them apart, and it matters:
 * a GIF has no sound, no seeking and no report worth reading.
 */
export const isGif = (entry: LibraryEntry): boolean => extensionOf(entry.mediaPath) === 'gif'

/**
 * A capture that collected from a browser.
 *
 * `kind` cannot answer this: a web session with video reads as a recording, and only a
 * session whose window could not be found reads as `session`. Steps are the tell — a
 * collector that ran wrote a trail — which does mean a session where nobody clicked
 * anything counts as a plain recording. That is the same rule the Web filter has always
 * used, and it is wrong in a case nobody has: a capture with no actions has nothing in
 * it that a recording does not.
 */
export const isWebSession = (entry: LibraryEntry): boolean => entry.kind === 'session' || entry.steps > 0

export function matchesFilter(entry: LibraryEntry, filter: Filter): boolean {
  switch (filter) {
    case 'problems':
      return hasFindings(entry)
    // A web session is a recording with a browser attached; it has its own chip, so it
    // does not also answer to this one.
    case 'recording':
      return entry.kind === 'recording' && !isGif(entry) && !isWebSession(entry)
    case 'gif':
      return isGif(entry)
    case 'screenshot':
      return entry.kind === 'screenshot'
    case 'session':
      return isWebSession(entry)
    default:
      return true
  }
}

export function applyFilter(entries: readonly LibraryEntry[], filter: Filter): LibraryEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filter))
}

/** How many each chip would show. A chip that would empty the list says so up front. */
export function filterCounts(entries: readonly LibraryEntry[]): Record<Filter, number> {
  const counts = {} as Record<Filter, number>
  for (const filter of FILTER_ORDER) {
    counts[filter] = entries.reduce((n, entry) => n + (matchesFilter(entry, filter) ? 1 : 0), 0)
  }
  return counts
}

/**
 * Which capture the detail should be showing.
 *
 * `pending` is a capture snapit was told to open — the one just recorded, or a row
 * clicked on the Overview — which may not be in the library listing yet, because the
 * folder scan that will include it is still running. Holding the selection through that
 * gap is the whole point: falling back to "the newest one listed" meant a recording you
 * had just saved opened the *previous* capture and stayed there, since by the time the
 * scan landed the old selection was valid again.
 */
export function resolveSelection(args: {
  shown: readonly LibraryEntry[]
  listed: readonly LibraryEntry[]
  selected: string | null
  pending: string | null
}): { selected: string | null; pending: string | null } {
  const { shown, listed, selected, pending } = args
  if (pending !== null) {
    // Listed but filtered out is still an answer: the caller clears the filter alongside
    // asking for it, so this only holds while the scan is genuinely behind.
    if (listed.some((e) => e.path === pending)) return { selected: pending, pending: null }
    return { selected, pending }
  }
  if (shown.length === 0) return { selected: null, pending: null }
  if (!shown.some((e) => e.path === selected)) return { selected: shown[0].path, pending: null }
  return { selected, pending: null }
}
