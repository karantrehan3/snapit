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
 * The line under a capture's name: what it is, then only the facts it actually has.
 * A screenshot with no duration and no steps should say "Screenshot · 240 KB", not
 * carry three empty fields to keep the columns even.
 */
export function metaLine(entry: LibraryEntry): string {
  return [
    KIND_LABEL[entry.kind],
    humanDuration(entry.durationMs),
    entry.steps > 0 ? `${entry.steps} step${entry.steps === 1 ? '' : 's'}` : '',
    entry.markers > 0 ? `${entry.markers} marker${entry.markers === 1 ? '' : 's'}` : '',
    humanBytes(entry.bytes)
  ]
    .filter(Boolean)
    .join(' · ')
}

export type Filter = 'all' | 'problems' | 'session'

export function applyFilter(entries: readonly LibraryEntry[], filter: Filter): LibraryEntry[] {
  if (filter === 'problems') return entries.filter(hasFindings)
  if (filter === 'session') return entries.filter((e) => e.kind === 'session' || e.steps > 0)
  return [...entries]
}
