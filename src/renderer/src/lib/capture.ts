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

export type Filter = 'all' | 'problems' | 'session'

export function applyFilter(entries: readonly LibraryEntry[], filter: Filter): LibraryEntry[] {
  if (filter === 'problems') return entries.filter(hasFindings)
  if (filter === 'session') return entries.filter((e) => e.kind === 'session' || e.steps > 0)
  return [...entries]
}
