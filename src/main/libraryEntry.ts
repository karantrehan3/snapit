import { join } from 'path'
import type { CaptureMeta } from './bundle'

/**
 * Turning what is on disk into what the library shows.
 *
 * Everything here is pure, and it is the half worth testing: a bundle's meta.json can
 * be missing, truncated or written by an older version, and a capture that exists must
 * still be listed. Nothing may throw — a folder snapit cannot describe is still a
 * folder someone can open, reveal and delete, and hiding it would be worse than
 * describing it thinly.
 */

export type LibraryKind = 'screenshot' | 'recording' | 'session'

export type LibraryEntry = {
  /** Bundle folder or loose file. This is the identity every action takes. */
  path: string
  name: string
  kind: LibraryKind
  /** ISO. Falls back to the file's own timestamp when metadata cannot say. */
  capturedAt: string
  bytes: number
  durationMs: number | null
  /** Absolute path of the media, when there is one to play or show. */
  mediaPath: string | null
  reportPath: string | null
  consoleErrors: number
  failedRequests: number
  steps: number
  markers: number
}

/** A `.png` is a still; a `.gif` is a short recording, whatever its container says. */
export function kindFor(mediaFile: string | null): LibraryKind {
  if (!mediaFile) return 'session'
  return mediaFile.toLowerCase().endsWith('.png') ? 'screenshot' : 'recording'
}

/**
 * `capture` must be an object, not merely present. `{ "capture": null }` passes a
 * key check and then throws on the first field read — which is the whole failure this
 * module exists to not have.
 */
const isMeta = (raw: unknown): raw is CaptureMeta => {
  if (!raw || typeof raw !== 'object') return false
  const capture = (raw as Record<string, unknown>).capture
  return !!capture && typeof capture === 'object'
}

const count = (raw: unknown): number => (typeof raw === 'number' && Number.isFinite(raw) ? raw : 0)

export type BundleFacts = {
  dir: string
  name: string
  /** Bare filename of the media inside the folder, or null for a session. */
  mediaFile: string | null
  hasReport: boolean
  bytes: number
  /** Used when metadata cannot say when this was captured. */
  mtimeMs: number
  /** Parsed meta.json, or null/garbage when it could not be read. */
  meta: unknown
}

export function bundleEntry(facts: BundleFacts): LibraryEntry {
  const meta = isMeta(facts.meta) ? facts.meta : null
  const collected = meta?.collected
  return {
    path: facts.dir,
    name: facts.name,
    kind: kindFor(facts.mediaFile),
    capturedAt: meta?.capturedAt ?? new Date(facts.mtimeMs).toISOString(),
    bytes: facts.bytes,
    durationMs: typeof meta?.capture.durationMs === 'number' ? meta.capture.durationMs : null,
    mediaPath: facts.mediaFile ? join(facts.dir, facts.mediaFile) : null,
    reportPath: facts.hasReport ? join(facts.dir, 'report.html') : null,
    consoleErrors: count(collected?.consoleErrors),
    failedRequests: count(collected?.failedRequests),
    steps: count(collected?.actions),
    markers: Array.isArray(meta?.capture.markers) ? meta.capture.markers.length : 0
  }
}

/** A capture saved as a loose file: no metadata exists, so the file is all there is. */
export function fileEntry(facts: {
  path: string
  name: string
  bytes: number
  mtimeMs: number
}): LibraryEntry {
  return {
    path: facts.path,
    name: facts.name,
    kind: kindFor(facts.name),
    capturedAt: new Date(facts.mtimeMs).toISOString(),
    bytes: facts.bytes,
    durationMs: null,
    mediaPath: facts.path,
    reportPath: null,
    consoleErrors: 0,
    failedRequests: 0,
    steps: 0,
    markers: 0
  }
}

/**
 * Newest first. Ties break on name so the order cannot shuffle between two reads of
 * the same folder — captures written in the same second are common, since a session
 * and its recording share a timestamp.
 */
export function sortEntries(entries: readonly LibraryEntry[]): LibraryEntry[] {
  return [...entries].sort(
    (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || a.name.localeCompare(b.name)
  )
}

/** Whether this capture has anything to say beyond existing. */
export const hasFindings = (e: LibraryEntry): boolean => e.consoleErrors > 0 || e.failedRequests > 0
