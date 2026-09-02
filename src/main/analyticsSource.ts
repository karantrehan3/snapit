import { readFile } from 'fs/promises'
import { join } from 'path'
import { BUNDLE_FILES } from './bundle'
import { summarise, type Analytics, type CaptureFacts, type RequestFact } from './analytics'
import { looseEntries, statusOf } from './collector/har'
import { listLibrary } from './library'
import { num, str } from './untrusted'

/**
 * Reading the save folder for the Analytics route.
 *
 * The aggregation is in `analytics.ts` and is pure; this is the half that touches disk,
 * and the only interesting thing about it is how much disk it touches. A session's HAR
 * runs to about half a megabyte, and there are fifty-five captures in the folder this
 * was written against — so reading all of them is thirty megabytes of JSON parsed in
 * the process that owns every window.
 *
 * Two bounds, therefore. Only bundles inside the window are opened at all, and only
 * `MAX_HARS` of them, newest first. Everything else still counts toward the totals,
 * because `listLibrary` already knows a capture's findings without opening its HAR — it
 * is the per-request detail that costs, and the per-request detail is what gets capped.
 */

/**
 * How many HARs to open. Fifty-five captures is 30 MB of JSON; this keeps a cold read
 * near a second while covering far more history than the default window shows.
 */
const MAX_HARS = 120

/** How far back the per-request detail is worth reading. Older captures still count. */
const WINDOW_DAYS = 90

const DAY_MS = 86_400_000

/**
 * The result, cached until the folder changes.
 *
 * Keyed on the capture count and the newest timestamp rather than on a timer: those two
 * together change whenever a capture is written or deleted, which is exactly when this
 * is stale, and never otherwise. `library:changed` is not enough on its own — the window
 * can be reopened long after.
 */
let cached: { key: string; value: Analytics } | null = null

function requestsFrom(har: unknown): RequestFact[] {
  const out: RequestFact[] = []
  for (const entry of looseEntries(har)) {
    const url = str(entry.request?.url)
    if (!url) continue
    out.push({
      method: str(entry.request?.method) || 'GET',
      url,
      status: statusOf(entry) ?? 0,
      durationMs: Math.max(0, num(entry.time) ?? 0)
    })
  }
  return out
}

/**
 * Every capture, reduced. Nothing here throws for one bad bundle: a folder whose HAR is
 * truncated still counts as a capture, the same principle `libraryEntry.ts` is built on.
 */
export async function readAnalytics(saveDir: string, now: Date = new Date()): Promise<Analytics> {
  const entries = await listLibrary(saveDir)
  const key = `${entries.length}:${entries[0]?.capturedAt ?? ''}:${entries[0]?.name ?? ''}`
  if (cached?.key === key) return cached.value

  const cutoff = now.getTime() - WINDOW_DAYS * DAY_MS
  let opened = 0

  const facts: CaptureFacts[] = await Promise.all(
    entries.map(async (entry) => {
      const base: CaptureFacts = {
        name: entry.name,
        capturedAt: entry.capturedAt,
        kind: entry.kind,
        bytes: entry.bytes,
        consoleErrors: entry.consoleErrors,
        requests: []
      }
      // A loose file has no HAR to read, and an old one is not worth opening.
      const at = Date.parse(entry.capturedAt)
      if (entry.reportPath === null || Number.isNaN(at) || at < cutoff) return base
      if (opened >= MAX_HARS) return base
      opened++
      try {
        const raw = await readFile(join(entry.path, BUNDLE_FILES.har), 'utf-8')
        return { ...base, requests: requestsFrom(JSON.parse(raw)) }
      } catch {
        // No HAR, or one a crash truncated. The capture still counts.
        return base
      }
    })
  )

  const value = summarise(facts, now)
  cached = { key, value }
  return value
}

/** Drop the cache. Called when a capture is written or deleted. */
export function forgetAnalytics(): void {
  cached = null
}
