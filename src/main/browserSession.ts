import { mkdir, writeFile } from 'fs/promises'
import { release } from 'os'
import { join } from 'path'
import { app, shell } from 'electron'
import { BUNDLE_FILES, buildMeta, bundleDir, type CollectedSummary } from './bundle'
import { captureBaseName } from './filename'
import { currentDisplays } from './displays'
import { renderReport, type ReportAction, type ReportConsoleLine } from './report'
import { getSettings } from './settings'
import { actionLabel } from './collector/actions'
import { startCollector, type CollectedSession, type CollectorHandle } from './collector/session'
import { summariseFailedRequests } from './mcp/summarise'

/**
 * A browser session: Chrome opened under snapit's control, everything it does recorded,
 * and a bundle written when it stops.
 *
 * This is the other half of a capture. A recording shows what the screen looked like; a
 * session shows what the application actually did — the console, the network, and the
 * steps that got there.
 */

let active: CollectorHandle | null = null
let startedAt: Date | null = null

export const isBrowserSessionActive = (): boolean => active !== null

const countRequests = (har: unknown): number =>
  ((har as { log?: { entries?: unknown[] } })?.log?.entries ?? []).length

function summarise(collected: CollectedSession, failed: number): CollectedSummary {
  return {
    console: collected.console.length,
    consoleErrors: collected.console.filter((c) => c.level === 'error' || c.level === 'uncaught').length,
    requests: countRequests(collected.har),
    failedRequests: failed,
    actions: collected.actions.length,
    navigations: collected.navigations.length
  }
}

export async function startBrowserSession(startUrl?: string): Promise<void> {
  if (active) throw new Error('A browser session is already running.')
  // Kept beside the app's own data and reused between sessions, so signing in to the
  // application under test is a once-per-machine cost.
  const profileDir = join(app.getPath('userData'), 'collector-profile')
  startedAt = new Date()
  try {
    active = await startCollector({ profileDir, startUrl })
  } catch (err) {
    startedAt = null
    throw err
  }
}

/** Stop, write the bundle, reveal it. Returns the bundle folder, or null if none ran. */
export async function stopBrowserSession(): Promise<string | null> {
  const handle = active
  if (!handle) return null
  active = null

  const collected = await handle.stop()
  const { saveDir } = getSettings()
  const dir = bundleDir(saveDir, captureBaseName())
  await mkdir(dir, { recursive: true })

  // The collected data is written first and independently: if the report fails to
  // render, the session's evidence must still be on disk.
  await Promise.all([
    writeFile(join(dir, BUNDLE_FILES.console), JSON.stringify(collected.console, null, 2)),
    writeFile(join(dir, BUNDLE_FILES.har), JSON.stringify(collected.har, null, 2)),
    writeFile(
      join(dir, BUNDLE_FILES.actions),
      JSON.stringify({ actions: collected.actions, navigations: collected.navigations }, null, 2)
    )
  ])

  const failed = summariseFailedRequests(collected.har, 100)
  const meta = buildMeta({
    kind: 'browser-session',
    capturedAt: startedAt ?? new Date(),
    appVersion: app.getVersion(),
    platform: process.platform,
    release: release(),
    arch: process.arch,
    locale: app.getLocale(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displays: currentDisplays(),
    durationMs: collected.durationMs,
    hasSystemAudio: false,
    source: null,
    markers: [],
    collected: summarise(collected, failed.length)
  })

  try {
    await writeFile(join(dir, BUNDLE_FILES.meta), JSON.stringify(meta, null, 2))
    const consoleLines: ReportConsoleLine[] = collected.console.map((c) => ({
      atMs: c.atMs,
      level: c.level,
      text: c.text
    }))
    const actions: ReportAction[] = collected.actions.map((a) => ({ atMs: a.atMs, label: actionLabel(a) }))
    await writeFile(
      join(dir, BUNDLE_FILES.report),
      renderReport(meta, { console: consoleLines, actions, failedRequests: failed })
    )
  } catch (err) {
    console.error('[snapit] session data saved, but its report could not be written:', err)
  }

  startedAt = null
  shell.showItemInFolder(join(dir, BUNDLE_FILES.report))
  return dir
}
