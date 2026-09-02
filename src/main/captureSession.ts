import { existsSync } from 'fs'
import { mkdir, rmdir, writeFile } from 'fs/promises'
import { release } from 'os'
import { basename, dirname, join } from 'path'
import { app, desktopCapturer } from 'electron'
import { BUNDLE_FILES, buildMeta, bundleDir, type CollectedSummary, type Marker } from './bundle'
import { captureBaseName } from './filename'
import { currentDisplays } from './displays'
import { renderReport, type ReportAction, type ReportConsoleLine } from './report'
import { getSettings } from './settings'
import { actionLabel } from './collector/actions'
import { summariseFailedRequests } from './mcp/summarise'
import { reportRequests } from './reportRequests'
import { actionsToSpec } from './specgen'
import { LANDING_TITLE } from './collector/landing'
import { startCollector, type CollectedSession, type CollectorHandle } from './collector/session'

/**
 * The capture session: one bundle that a browser collection and a screen recording can
 * both contribute to.
 *
 * They used to write separate folders, which was survivable but meant a step in the
 * action trail could never reach the frame it happened on — different folders, different
 * clocks. Here the session owns a single origin, the recording reports where it began
 * relative to it, and everything the collector saw can be converted onto the video's
 * clock. That conversion is what lets a repro step seek the recording, and it is what
 * assertion generation will need.
 *
 * A recording taken with no session open still writes its own bundle exactly as before.
 */

type Recording = {
  mediaName: string
  mediaBytes: number
  ext: string
  durationMs: number | null
  markers: Marker[]
  hasSystemAudio: boolean
  source: { id: string; name: string; type: 'screen' | 'window' } | null
  /** When the recording began, relative to the session's origin. May be negative. */
  offsetMs: number
}

/**
 * `setup` is everything before the flow starts — signing in, navigating, getting to the
 * broken page. It is collected but discarded, because it is not what is being captured.
 */
export type SessionPhase = 'setup' | 'capturing'

type OpenSession = {
  dir: string
  phase: SessionPhase
  /** desktopCapturer id of the Chrome window snapit launched, once it can be found. */
  windowSourceId: string | null
  /** True when snapit started the recording itself, so one Stop should end both. */
  autoRecording: boolean
  startedAt: Date
  /** Wall clock at the session's origin; every offset is measured from this. */
  originMs: number
  collector: CollectorHandle | null
  recording: Recording | null
}

let session: OpenSession | null = null

export const isBrowserSessionActive = (): boolean => session?.collector != null

export const sessionPhase = (): SessionPhase | null => session?.phase ?? null

/** Snapit started the recording, so stopping it should stop the session too. */
export const isAutoRecording = (): boolean => session?.autoRecording === true

export function markAutoRecording(): void {
  if (session) session.autoRecording = true
}

/** The Chrome window snapit launched, so a recording can target it without a picker. */
export const sessionWindowSourceId = (): string | null => session?.windowSourceId ?? null

/**
 * Find the window snapit just opened.
 *
 * The landing page's title is the marker — it is set precisely so this is possible, and
 * it is only reliable before the user navigates away, which is why this runs at launch
 * and the answer is kept.
 */
async function findLaunchedWindow(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      })
      const match = sources.find((s) => s.name.includes(LANDING_TITLE))
      if (match) return match.id
    } catch (err) {
      console.warn('[snapit] could not list windows to find the collector browser:', err)
      return null
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

/**
 * End setup and start the capture. Everything collected so far is thrown away and the
 * clock restarts, so the trail, the HAR and the generated spec all begin at the flow.
 */
export function beginCapture(): boolean {
  if (!session?.collector || session.phase === 'capturing') return false
  session.collector.beginCapture()
  session.phase = 'capturing'
  // A recording already running started before the capture; a negative offset is the
  // correct description of that, and videoTimeSec handles it.
  session.originMs = Date.now()
  session.startedAt = new Date()
  return true
}

/**
 * Name the profile so Chrome's own UI identifies the window as snapit's. Only on first
 * run — Chrome owns this file afterwards, and a failure here is cosmetic.
 */
async function markProfile(profileDir: string): Promise<void> {
  const prefs = join(profileDir, 'Default', 'Preferences')
  if (existsSync(prefs)) return
  try {
    await mkdir(dirname(prefs), { recursive: true })
    await writeFile(prefs, JSON.stringify({ profile: { name: LANDING_TITLE } }))
  } catch (err) {
    console.warn('[snapit] could not name the collector profile:', err)
  }
}

/** The folder a recording should write into, or null when no session is open. */
export const openSessionDir = (): string | null => session?.dir ?? null

/** Where a recording starting now sits on the session's clock. */
export const sessionOffsetFor = (startedAtMs: number): number =>
  session ? startedAtMs - session.originMs : 0

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
  if (session?.collector) throw new Error('A browser session is already running.')

  const { saveDir } = getSettings()
  const dir = bundleDir(saveDir, captureBaseName())
  await mkdir(dir, { recursive: true })

  // Kept beside the app's own data and reused between sessions, so signing in to the
  // application under test is a once-per-machine cost.
  const profileDir = join(app.getPath('userData'), 'collector-profile')
  await markProfile(profileDir)
  const started: OpenSession = {
    dir,
    phase: 'setup',
    windowSourceId: null,
    autoRecording: false,
    startedAt: new Date(),
    originMs: Date.now(),
    collector: null,
    recording: null
  }
  session = started
  try {
    started.collector = await startCollector({ profileDir, startUrl })
  } catch (err) {
    session = null
    throw err
  }
  // Not awaited: the user is already looking at the browser, and nothing needs this
  // until they start the capture.
  void findLaunchedWindow().then((id) => {
    if (session === started) started.windowSourceId = id
  })

  // A caller that named a URL has said where the flow starts, so there is no setup to
  // sit through. Without one, the user gets themselves ready and starts the capture.
  if (startUrl) beginCapture()
}

/**
 * Hand a finished recording to the open session instead of writing its own bundle.
 * Returns false when there is nothing to join, and the caller writes its own.
 */
export function contributeRecording(recording: Recording): boolean {
  if (!session) return false
  session.recording = recording
  return true
}

/** Stop, write the bundle, reveal it. Returns the bundle folder, or null if none ran. */
export async function stopBrowserSession(): Promise<string | null> {
  const open = session
  const handle = open?.collector
  if (!open || !handle) return null
  open.collector = null
  session = null

  /*
   * Stopping during setup is a cancel, and a cancel leaves nothing behind.
   *
   * This used to write a bundle anyway, on the reasoning that discarding a session
   * somebody ran was worse than keeping a thin one. That was wrong about what setup is:
   * setup is explicitly the part that gets thrown away — signing in, navigating, getting
   * to the broken page — and `beginCapture` throws it away even when the session
   * continues. So a session stopped before it ever started has nothing in it that was
   * ever meant to be kept, and writing it produces a capture with a real name, a real
   * timestamp and a step count, sitting in the library looking like evidence.
   *
   * The folder goes too, but only with `rmdir`, which fails on a directory that is not
   * empty. Nothing is written until below, so it will be empty — and if it somehow is
   * not, the right answer is to keep whatever is in there rather than delete it.
   */
  if (open.phase === 'setup' && open.recording === null) {
    await handle.stop()
    try {
      await rmdir(open.dir)
    } catch {
      // Not empty, or already gone. Either way there is nothing safe to remove.
    }
    return null
  }

  const collected = await handle.stop()
  const { dir } = open
  await mkdir(dir, { recursive: true })

  // Written first and independently: if the report fails to render, the session's
  // evidence must still be on disk.
  await Promise.all([
    writeFile(join(dir, BUNDLE_FILES.console), JSON.stringify(collected.console, null, 2)),
    writeFile(join(dir, BUNDLE_FILES.har), JSON.stringify(collected.har, null, 2)),
    writeFile(
      join(dir, BUNDLE_FILES.actions),
      JSON.stringify({ actions: collected.actions, navigations: collected.navigations }, null, 2)
    )
  ])

  // A Playwright skeleton of what just happened. Written even when the session recorded
  // nothing worth turning into a test — an empty one costs nothing and its absence is
  // harder to explain than its emptiness.
  try {
    await writeFile(
      join(dir, BUNDLE_FILES.spec),
      actionsToSpec({
        actions: collected.actions,
        navigations: collected.navigations,
        markers: open.recording?.markers ?? [],
        recordingOffsetMs: open.recording?.offsetMs,
        bundleName: basename(dir)
      })
    )
  } catch (err) {
    console.error('[snapit] could not write the generated spec:', err)
  }

  const rec = open.recording
  const failed = summariseFailedRequests(collected.har, 100)
  const meta = buildMeta({
    // A session that also recorded is both; the kind names the richer half.
    kind: rec ? 'recording' : 'browser-session',
    capturedAt: open.startedAt,
    appVersion: app.getVersion(),
    platform: process.platform,
    release: release(),
    arch: process.arch,
    locale: app.getLocale(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displays: currentDisplays(),
    durationMs: collected.durationMs,
    hasSystemAudio: rec?.hasSystemAudio ?? false,
    source: rec?.source ?? null,
    markers: rec?.markers ?? [],
    recordingOffsetMs: rec ? rec.offsetMs : undefined,
    ...(rec ? { mediaName: rec.mediaName, mediaBytes: rec.mediaBytes, ext: rec.ext } : {}),
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
    // The HAR's timestamps are absolute; everything else in the bundle counts from the
    // capture's origin, so they are converted onto that clock here and nowhere else.
    const requests = reportRequests(collected.har, Date.parse(meta.capturedAt))
    await writeFile(
      join(dir, BUNDLE_FILES.report),
      renderReport(meta, { console: consoleLines, actions, requests })
    )
  } catch (err) {
    console.error('[snapit] session data saved, but its report could not be written:', err)
  }

  // Deliberately does not reveal anything: where the bundle goes on screen is the
  // caller's decision, and `index.ts` shows it in the app.
  return dir
}
