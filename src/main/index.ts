import { basename, dirname, join, parse } from 'path'
import { existsSync } from 'fs'
import { release } from 'os'
import { mkdir, readFile, writeFile } from 'fs/promises'
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  clipboard,
  desktopCapturer,
  nativeImage,
  shell,
  dialog,
  Notification,
  session as electronSession,
  systemPreferences,
  type Display
} from 'electron'
import { captureDisplay, getDisplaySource, type DisplaySource } from './capture'
import { setCaptureMarkers } from './markerStore'
import { getSettings, setSettings, markWelcomeSeen, regenerateMcpToken, type Settings } from './settings'
import type { CapturePrefs } from './capturePrefs'
import { checkForUpdate, type UpdateInfo } from './updater'
import { captureBaseName, captureFilePath } from './filename'
import { bundleLayout, buildMeta, resolveDurationMs, sanitizeMarkers, type CaptureSource } from './bundle'
import { currentDisplays } from './displays'
import { BUNDLE_FILES, type CaptureMeta } from './bundle'
import { bundleMarkdown } from './markdown'
import { readBundleJson, targetBundle } from './mcp/bundles'
import { summariseConsole, summariseFailedRequests, summariseSteps } from './mcp/summarise'
import type { ActionRecord } from './collector/actions'
import type { ConsoleEntry } from './collector/session'
import {
  beginCapture,
  contributeRecording,
  isAutoRecording,
  markAutoRecording,
  sessionWindowSourceId,
  isBrowserSessionActive,
  openSessionDir,
  sessionOffsetFor,
  sessionPhase,
  startBrowserSession,
  stopBrowserSession,
  type SessionPhase
} from './captureSession'
import { renderReport } from './report'
import { assertInside, deleteCapture, listLibrary, renameCapture, thumbnailFor } from './library'
import { shareCapture } from './share'
import {
  EDITABLE_EXTENSIONS,
  bufferFromDataUrl,
  isEditableImage,
  mimeForPath,
  normalizeExt
} from './imageFile'
import { CAPTURE_SCHEME } from './captureUrl'
import { mcpState } from './mcpStatus'
import { forgetAnalytics, readAnalytics } from './analyticsSource'
import { str } from './untrusted'
import { TRAY_TEMPLATE_DATA_URL, TRAY_COLOUR_DATA_URL } from './trayIcon'
import {
  startMcpServer,
  stopMcpServer,
  disconnectAllSessions,
  mcpSetupCommand,
  mcpActivity
} from './mcp/httpServer'
import {
  captureView,
  installCaptureProtocol,
  registerCaptureScheme,
  revokeCaptureAccess
} from './captureProtocol'
import {
  closeWindow,
  loadRenderer,
  notifyWindow,
  openWindow,
  watchForQuit,
  whenClosed,
  windowFor
} from './windows'

// NOTE: app.disableHardwareAcceleration() used to be called here on macOS 26+, because
// Tahoe presents transparent full-screen windows so slowly the overlay took 2-3s to appear
// (https://github.com/electron/electron/issues/48311). It is gone because it cost more than
// it bought: without the GPU, WebCodecs has no `bitrateMode: 'quantizer'`, so recordings
// fell back to a software encoder needing ~1012 kbps for the quality constant-quality
// reaches at 677 kbps — and the fallback also tags colour as BT.601, which looks flat.
//
// If the slow overlay returns, prefer a narrower switch. Measured: 'disable-gpu-rasterization'
// keeps quantizer mode available, while 'disable-gpu-compositing' does not.

/** How often to re-check GitHub for a newer release while the app runs. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * snapit shell.
 *
 * Background tray app with three capture modes behind configurable global hotkeys:
 *   - screenshot: freeze the display, drag-select, annotate → copy / save.
 *   - record: full-screen or region screen recording (optional mic) → .webm.
 *   - gif: full-screen or region screen recording, encoded client-side → .gif.
 *
 * Captures can be copied to the clipboard, saved to a default folder, or saved-as
 * via a dialog. Hotkeys and the save folder are editable in the settings window.
 */

type CaptureMode = 'screenshot' | 'record' | 'gif'

type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

/**
 * Usable area of the display, in overlay-window coordinates. Excludes the macOS Dock
 * and menu bar (and the Windows taskbar). The overlay window spans the display's full
 * bounds, so chrome positioned against the window alone can land behind them.
 */
type WorkArea = { x: number; y: number; w: number; h: number }

type CaptureSession = (
  | { mode: 'screenshot'; frame: Frame }
  | { mode: 'record'; source: DisplaySource; prefs: CapturePrefs; auto?: { sourceId: string } }
  | { mode: 'gif'; source: DisplaySource; prefs: CapturePrefs }
  // Chrome only: the browser is what the user is looking at, and this is the bar that
  // says snapit is collecting from it and offers the one action worth taking.
  | { mode: 'session'; phase: SessionPhase; prefs: CapturePrefs; videoUnavailable?: boolean }
) & { workArea: WorkArea }

/** `display.workArea` is in screen coordinates; shift it to be window-relative. */
function windowWorkArea(display: Display): WorkArea {
  return {
    x: display.workArea.x - display.bounds.x,
    y: display.workArea.y - display.bounds.y,
    w: display.workArea.width,
    h: display.workArea.height
  }
}

/** An existing image opened for editing (Finder "Open With", argv, or tray dialog). */
type EditSession = { path: string; name: string; ext: string; mime: string; dataUrl: string }

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let session: CaptureSession | null = null
let editSession: EditSession | null = null
// Image paths requested before the app is ready (macOS cold-start 'open-file').
const pendingOpenPaths: string[] = []
let recordWantsSystemAudio = false
let recordSourceId: string | null = null
/** Set when a recording is prepared, so the bundle can report how long it ran. */
let recordStartedAt: number | null = null
/** Resolved asynchronously at prepare time — the window/screen the recording captured. */
let recordSource: CaptureSource = null

/**
 * Drops a marker on the running recording. Registered only while one is in progress:
 * holding a global shortcut permanently for something that does nothing the rest of
 * the time would take it away from every other app.
 */
const MARKER_HOTKEY = 'CommandOrControl+Shift+M'

function setMarkerHotkey(active: boolean): void {
  if (!active) {
    globalShortcut.unregister(MARKER_HOTKEY)
    return
  }
  if (globalShortcut.isRegistered(MARKER_HOTKEY)) return
  if (!globalShortcut.register(MARKER_HOTKEY, () => overlayWindow?.webContents.send('record:marker'))) {
    console.error(`[snapit] Failed to register marker hotkey: ${MARKER_HOTKEY}`)
  }
}
// Start this mode once the current overlay is dismissed (the GIF → video switch).
let pendingCaptureMode: CaptureMode | null = null
/**
 * The app hid itself to get out of the way of a capture it started, so it owes the user
 * the window back. Only set when the capture came from the window — a hotkey press has
 * nothing to restore.
 */
let restoreHomeAfterCapture = false
// Latest available update (from GitHub), or null when up to date / not yet checked.
let availableUpdate: UpdateInfo | null = null
// Set while an MCP `pick_region` call is waiting on the user to finish a screenshot
// capture (copy/save/save-as resolves it; Esc/dismiss without acting rejects it).
let pendingMcpCapture: { resolve: (dataUrl: string) => void; reject: (err: Error) => void } | null = null

// Locks the packaged renderer to its own bundle: no remote script, no eval, no
// plugins, no framing. data:/blob: cover the frozen-frame dataURL, source-picker
// thumbnails, and canvas streams; 'unsafe-inline' style covers React inline styles
// and the <style> block in index.html. Applied in production only (see below).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${CAPTURE_SCHEME}:`,
  `media-src 'self' blob: ${CAPTURE_SCHEME}:`,
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  // The home window frames a capture's report. It is the only thing this renderer may
  // frame, and the scheme it arrives on is the only thing that may be framed — see
  // `captureUrl.ts` for why it is a scheme and not an `srcdoc`, and
  // `features/home/CaptureDetail.tsx` for what the frame's sandbox permits.
  `frame-src ${CAPTURE_SCHEME}:`
].join('; ')

/** A renderer-supplied value is only accepted as image bytes if it's an image dataURL. */
const isImageDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/')

/**
 * Write a finished recording: a bundle folder (media + meta.json + report.html) when
 * enabled, a loose file when not. Reveals the media and closes the overlay either
 * way, and returns the media path — which is the same path in both shapes, one
 * directory deeper.
 */
async function persistRecording(data: ArrayBuffer, ext: string, details: unknown): Promise<string> {
  const { saveDir, bundleRecordings } = getSettings()
  await mkdir(saveDir, { recursive: true })
  const bytes = Buffer.from(data)

  const finish = (mediaPath: string): string => {
    refreshLibrary()
    // The capture, not the folder it is in. `bundleRecordings` decides whether the
    // library's entry is the folder or the loose file, so show whichever it listed.
    showCaptureInApp(bundleRecordings ? dirname(mediaPath) : mediaPath)
    closeOverlayWindow()
    recordStartedAt = null
    recordSource = null
    return mediaPath
  }

  if (!bundleRecordings) {
    const filePath = captureFilePath(saveDir, ext)
    await writeFile(filePath, bytes)
    return finish(filePath)
  }

  // A session already has a bundle open; join it rather than writing a second one
  // beside it, so a repro step and the frame it happened on end up together.
  const sessionDir = openSessionDir()
  const base = captureBaseName()
  const layout = bundleLayout(saveDir, base, ext)
  // In a session the folder is already open under an earlier name; only the media file
  // is written here, and it keeps the same stem it would have had on its own.
  const dir = sessionDir ?? layout.dir
  const mediaName = layout.mediaName
  const mediaPath = join(dir, mediaName)
  await mkdir(dir, { recursive: true })
  await writeFile(mediaPath, bytes)
  const reported = (details as { durationMs?: unknown } | null)?.durationMs
  const durationMs = resolveDurationMs(
    reported,
    recordStartedAt === null ? null : Date.now() - recordStartedAt
  )
  const markers = sanitizeMarkers((details as { markers?: unknown } | null)?.markers, durationMs)

  if (sessionDir) {
    // The session writes the metadata and the report when it stops, covering both
    // halves; there is nothing more to do here than hand over what was recorded.
    contributeRecording({
      mediaName,
      mediaBytes: bytes.byteLength,
      ext,
      durationMs,
      markers,
      hasSystemAudio: recordWantsSystemAudio,
      source: recordSource,
      offsetMs: sessionOffsetFor(recordStartedAt ?? Date.now())
    })
    // Snapit started this recording as part of a web-app capture, so its Stop is the
    // capture's Stop. The session reveals the finished report, so this one stays quiet
    // rather than opening Finder twice.
    if (isAutoRecording()) {
      closeOverlayWindow()
      recordStartedAt = null
      recordSource = null
      void endBrowserSession()
      return mediaPath
    }
    return finish(mediaPath)
  }

  // The recording is already safe on disk by this point. Failing to write the context
  // around it is worth logging, but it is not a failed capture — never let it throw
  // back to the renderer, which would report the recording as lost.
  try {
    const meta = buildMeta({
      capturedAt: new Date(),
      appVersion: app.getVersion(),
      platform: process.platform,
      release: release(),
      arch: process.arch,
      locale: app.getLocale(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      displays: currentDisplays(),
      durationMs,
      hasSystemAudio: recordWantsSystemAudio,
      source: recordSource,
      markers,
      mediaName: layout.mediaName,
      mediaBytes: bytes.byteLength,
      ext
    })
    await writeFile(layout.metaPath, JSON.stringify(meta, null, 2))
    await writeFile(layout.reportPath, renderReport(meta))
  } catch (err) {
    console.error('[snapit] recording saved, but its report could not be written:', err)
  }

  return finish(mediaPath)
}

/**
 * Create the overlay window once and reuse it. macOS takes 1-3s to present a freshly
 * created full-screen window, so recreating it per capture made every screenshot slow.
 */
function ensureOverlayWindow(): BrowserWindow {
  if (overlayWindow) return overlayWindow

  overlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false,
      // Hidden between captures; without this Chromium throttles the hidden window's
      // rAF/timers and the paint handshake (below) would stall ~1s.
      backgroundThrottling: false
    }
  })

  // NOTE: do NOT use the 'screen-saver' level — windows at that level cannot become
  // the macOS key window, which blocks keyboard focus (text annotation can't be typed).
  // The default floating always-on-top still sits above normal windows AND can be key.
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Loaded once; it stays mounted and receives each capture via IPC.
  loadRenderer(overlayWindow)

  return overlayWindow
}

function revealOverlay(): void {
  overlayWindow?.show()
  // The Dock is hidden (accessory app), so explicitly activate the app — otherwise
  // the window never becomes "key" and HTML inputs (text annotation) can't be typed.
  if (process.platform === 'darwin') app.focus({ steal: true })
  overlayWindow?.focus()
  overlayWindow?.webContents.focus()
}

// Reveal only after the renderer reports it painted the frame, else the window shows
// before the frame lands and flickers. The timer is a fallback so a missed signal
// can't leave the overlay stuck hidden.
let revealFallback: ReturnType<typeof setTimeout> | null = null

function revealWhenPainted(activate: boolean): void {
  if (revealFallback) clearTimeout(revealFallback)
  revealFallback = setTimeout(() => doReveal(activate), 400)
}

let pendingActivate = true

function doReveal(activate: boolean): void {
  if (!revealFallback) return
  clearTimeout(revealFallback)
  revealFallback = null
  // The session bar floats over a browser someone is typing into. Stealing focus to
  // show it would put their next keystroke somewhere they did not aim it.
  if (activate) revealOverlay()
  else overlayWindow?.showInactive()
}

/** Position the reused overlay on the cursor's display and push the session to it. */
function showOverlay(display: Display, opts: { activate?: boolean } = {}): void {
  const win = ensureOverlayWindow()
  const activate = opts.activate ?? true
  pendingActivate = activate
  win.setBounds(display.bounds)
  // Reset state a prior recording may have left on (window is reused, not recreated).
  win.setContentProtection(false)
  win.setIgnoreMouseEvents(false)

  const push = (): void => {
    win.webContents.send('capture:session', session)
    revealWhenPainted(activate)
  }
  // First capture: renderer still loading, so push once ready; later captures push now.
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', push)
  else push()
}

/** Resolve a pending MCP `pick_region` call with the finished capture's data URL. */
function resolvePendingMcpCapture(dataUrl: string): void {
  if (!pendingMcpCapture) return
  const { resolve } = pendingMcpCapture
  pendingMcpCapture = null
  resolve(dataUrl)
}

/** Reject a pending MCP `pick_region` call (dismissed without copy/save, or failed to start). */
function rejectPendingMcpCapture(message: string): void {
  if (!pendingMcpCapture) return
  const { reject } = pendingMcpCapture
  pendingMcpCapture = null
  reject(new Error(message))
}

/**
 * Open the screenshot overlay on behalf of an MCP `pick_region` call and wait for
 * the user to finish it. Rejects immediately if a capture is already in progress,
 * or once `startCapture` returns without opening a session (e.g. permission denied).
 */
function requestInteractiveCapture(): Promise<string> {
  if (session || pendingMcpCapture) {
    return Promise.reject(new Error('snapit is busy with another capture — try again once it finishes.'))
  }
  return new Promise((resolve, reject) => {
    pendingMcpCapture = { resolve, reject }
    void startCapture('screenshot').then(() => {
      if (!session && pendingMcpCapture) {
        rejectPendingMcpCapture('Failed to start screen capture (check Screen Recording permission).')
      }
    })
  })
}

/** Dismiss the current capture: clear the renderer, hide the overlay (kept alive). */
function closeOverlayWindow(): void {
  rejectPendingMcpCapture('Capture dismissed without saving.')
  if (restoreHomeAfterCapture) {
    restoreHomeAfterCapture = false
    // `show` rather than `openWindow`: it was hidden, not closed, so its route and its
    // scroll position are still there.
    windowFor('home')?.show()
  }
  setMarkerHotkey(false)
  session = null
  if (revealFallback) {
    clearTimeout(revealFallback)
    revealFallback = null
  }
  // Unmount the mode overlay (stops any recorder) before hiding.
  overlayWindow?.webContents.send('capture:session', null)
  overlayWindow?.hide()
  if (pendingCaptureMode) {
    const next = pendingCaptureMode
    pendingCaptureMode = null
    void startCapture(next)
  }
}

/** Tell an open home window its list is stale, so a new capture appears without a reopen. */
function refreshLibrary(): void {
  forgetAnalytics()
  notifyWindow('home', 'library:changed')
}

/**
 * Show a finished capture in the app rather than in Finder.
 *
 * Every save used to end at `shell.showItemInFolder`, which answers "where is the file"
 * — a question nobody has just after making a capture. What they want is to look at it,
 * and snapit is now the place that shows it. Finder is still one click away on the
 * capture itself.
 *
 * Deliberately not called when a screenshot goes to the clipboard: that path ends with
 * the image already in the user's hands, on the way somewhere else, and interrupting it
 * with a window is the opposite of helping.
 */
/**
 * Leave the editor route and drop the image it was holding.
 *
 * The editor used to be a window, so finishing with it meant closing one. It is a route
 * now, so finishing means telling the window to go back — and the image has to be
 * released either way, or the next `edit:get` hands back the last one.
 */
function leaveEditor(): void {
  editSession = null
  notifyWindow('home', 'edit:closed')
}

function showCaptureInApp(capturePath: string): void {
  openWindow('home')
  // The window may have been created by that call and still be loading, so this is sent
  // once it has something to receive it with.
  const win = windowFor('home')
  const send = (): void => notifyWindow('home', 'home:show-capture', capturePath)
  if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

const SCREEN_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/**
 * Tell someone what went wrong, where they will see it.
 *
 * These paths all used to end at console.error, which nobody reading a report with no
 * video in it is looking at. A notification rather than a dialog: the failure has
 * already happened and there is no decision to make, so interrupting adds nothing.
 */
function notifyProblem(title: string, body: string): void {
  console.error(`[snapit] ${title}: ${body}`)
  try {
    new Notification({ title, body }).show()
  } catch (err) {
    console.warn('[snapit] could not show a notification:', err)
  }
}

/** Asked once per run: a hotkey that reopens System Settings every time is its own bug. */
let promptedForScreen = false

/**
 * Check screen-recording permission and, if it is missing, say why before doing
 * anything about it.
 *
 * This used to throw the user into System Settings with no explanation — a pane opening
 * by itself, in another application, in response to a hotkey. The dialog is the whole
 * point: without the permission macOS hands back black frames rather than an error, so
 * a capture that looks broken is the only signal there is.
 */
function ensureScreenPermission(): void {
  if (process.platform !== 'darwin') return
  const status = systemPreferences.getMediaAccessStatus('screen')
  console.log(`[snapit] screen-recording permission: ${status}`)
  if (status === 'granted' || promptedForScreen) return
  promptedForScreen = true
  console.warn(
    '[snapit] Screen Recording not granted. NOTE: when launched from a terminal, ' +
      'the permission belongs to the TERMINAL app — grant it there, then relaunch.'
  )
  void dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['Open System Settings', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      message: 'snapit needs Screen Recording permission',
      detail:
        'Without it macOS hands back black frames rather than an error, so captures come out black with nothing to explain why.\n\nGrant snapit under Privacy & Security → Screen Recording, then try again.'
    })
    .then(({ response }) => {
      if (response === 0) void shell.openExternal(SCREEN_SETTINGS_URL)
    })
}

async function startCapture(mode: CaptureMode): Promise<void> {
  if (session) {
    // A second record/gif hotkey press stops & saves; otherwise just dismiss.
    if (session.mode === 'record' || session.mode === 'gif') overlayWindow?.webContents.send('record:stop')
    // The session bar is not a capture waiting to be dismissed — it is the only sign
    // that a browser is being collected from, and the only way to stop it. A stray
    // hotkey taking it off screen would leave a session running invisibly.
    else if (session.mode !== 'session') closeOverlayWindow()
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)

  if (mode === 'screenshot') {
    ensureScreenPermission()
    try {
      const dataUrl = await captureDisplay(display)
      session = {
        mode,
        workArea: windowWorkArea(display),
        frame: {
          dataUrl,
          width: display.bounds.width,
          height: display.bounds.height,
          scaleFactor: display.scaleFactor
        }
      }
    } catch (err) {
      // Pressing a hotkey and having nothing at all happen is the worst version of
      // this: the user cannot tell a failure from a missed keypress.
      notifyProblem('Screenshot failed', err instanceof Error ? err.message : String(err))
      return
    }
  } else {
    // record and gif both capture a live display source; only the encoding differs.
    try {
      session = {
        mode,
        workArea: windowWorkArea(display),
        source: await getDisplaySource(display),
        // Sent with the session rather than fetched by the overlay: the bar renders
        // once, correct, instead of painting defaults and then correcting itself.
        prefs: getSettings().capture
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`[snapit] ${mode} source failed: ${detail}`)
      return
    }
  }

  showOverlay(display)
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const { screenshotHotkey, recordHotkey, gifHotkey } = getSettings()
  if (!globalShortcut.register(screenshotHotkey, () => void startCapture('screenshot'))) {
    console.error(`[snapit] Failed to register screenshot hotkey: ${screenshotHotkey}`)
  }
  if (!globalShortcut.register(recordHotkey, () => void startCapture('record'))) {
    console.error(`[snapit] Failed to register record hotkey: ${recordHotkey}`)
  }
  if (!globalShortcut.register(gifHotkey, () => void startCapture('gif'))) {
    console.error(`[snapit] Failed to register gif hotkey: ${gifHotkey}`)
  }
}

/**
 * Put a bundle on the clipboard as Markdown, ready to paste into a ticket, a pull
 * request or a chat.
 *
 * This is the whole integration story on purpose. snapit does not talk to Jira, Linear
 * or Slack: whoever files the ticket is already signed in to it, and a paste costs them
 * one keystroke against an OAuth flow and a token to keep alive here.
 *
 * It used to be a tray item acting on "the last report" — an object nobody could see,
 * name or choose. It is now an action on the capture you picked in the library, which
 * is the same code addressing something visible.
 */
async function copyReportAsMarkdown(bundle?: string): Promise<void> {
  try {
    const { saveDir } = getSettings()
    const dir = bundle ? assertInside(saveDir, bundle) : await targetBundle(saveDir)
    const meta = await readBundleJson<CaptureMeta>(dir, BUNDLE_FILES.meta)
    if (!meta) throw new Error(`${basename(dir)} has no readable metadata.`)

    const consoleEntries = (await readBundleJson<ConsoleEntry[]>(dir, BUNDLE_FILES.console)) ?? []
    const har = await readBundleJson<unknown>(dir, BUNDLE_FILES.har)
    const actionFile = await readBundleJson<{ actions?: ActionRecord[] }>(dir, BUNDLE_FILES.actions)

    clipboard.writeText(
      bundleMarkdown({
        bundleName: basename(dir),
        meta,
        steps: summariseSteps(actionFile?.actions ?? []),
        failedRequests: har ? summariseFailedRequests(har, 50) : [],
        console: summariseConsole(consoleEntries, { limit: 50 })
      })
    )
    new Notification({ title: 'Report copied as Markdown', body: basename(dir) }).show()
  } catch (err) {
    void dialog.showMessageBox({
      type: 'error',
      message: 'Could not copy the report',
      detail: err instanceof Error ? err.message : String(err)
    })
  }
}

/** Put the session bar on screen for the phase the session is currently in. */
function showSessionBar(videoUnavailable = false): void {
  const phase = sessionPhase()
  if (!phase) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  session = {
    mode: 'session',
    phase,
    // The bar carries the audio toggles for a capture that starts itself, so it needs
    // the same prefs the record bar opens with.
    prefs: getSettings().capture,
    workArea: windowWorkArea(display),
    ...(videoUnavailable ? { videoUnavailable } : {})
  }
  // Without activate:false the bar would take focus from the browser the user is about
  // to type into.
  showOverlay(display, { activate: false })
}

/**
 * Open Chrome under snapit's control, and put the bar on screen.
 *
 * A session running with no visible sign of it would be a surprise, given it records
 * everything the browser does — and the tray menu it used to live in is the wrong place
 * for a control whose whole value is being pressed at a particular moment.
 */
async function beginBrowserSession(): Promise<void> {
  try {
    await startBrowserSession()
    showSessionBar()
    buildTray()
  } catch (err) {
    dialog.showMessageBox({
      type: 'error',
      message: 'Could not start a browser session',
      detail: err instanceof Error ? err.message : String(err)
    })
  }
}

async function endBrowserSession(): Promise<void> {
  // Taken down first: the bundle write and its Finder reveal take a moment, and a bar
  // still saying "capturing" through them would be lying.
  if (session?.mode === 'session') closeOverlayWindow()
  try {
    // Null means it was cancelled during setup and nothing was written. The library is
    // still refreshed: a recording may have contributed to it before the cancel.
    const dir = await stopBrowserSession()
    refreshLibrary()
    // Null when it was cancelled during setup and nothing was written.
    if (dir) showCaptureInApp(dir)
  } catch (err) {
    console.error('[snapit] failed to finish the browser session:', err)
    dialog.showMessageBox({
      type: 'error',
      message: 'The browser session did not save cleanly',
      detail: err instanceof Error ? err.message : String(err)
    })
  } finally {
    buildTray()
  }
}

/**
 * Begin the capture: trim the collector back to now, and start recording the browser
 * window snapit opened. No source picker — snapit launched the window, so it knows
 * which one, and being asked to point at it would be the interface apologising for
 * its own implementation.
 */
async function startWebAppCapture(): Promise<void> {
  beginCapture()
  const sourceId = sessionWindowSourceId()
  if (!sourceId) {
    // Rare: the window could not be identified. Better a capture with no video than no
    // capture, since the collector is already running — but the bar has to say so, or
    // the missing video is discovered in the report with nothing to explain it. It also
    // stays on screen as the only way left to stop, there being no recording pill.
    console.warn('[snapit] could not find the collector browser window; capturing without video')
    showSessionBar(true)
    buildTray()
    return
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  try {
    session = {
      mode: 'record',
      workArea: windowWorkArea(display),
      source: await getDisplaySource(display),
      prefs: getSettings().capture,
      auto: { sourceId }
    }
    markAutoRecording()
    showOverlay(display)
  } catch (err) {
    // The collector is already running, so the capture is under way — but it will have
    // no video, and the report would be the first place anyone found that out.
    notifyProblem(
      'Capturing without video',
      `The browser window could not be recorded, so this capture holds console, network and steps only. ${err instanceof Error ? err.message : String(err)}`
    )
    showSessionBar(true)
  }
  buildTray()
}

/**
 * The way in, and a way out. Starting the capture is deliberately not here: it is the
 * one action with a right moment, and a menu you have to go looking for is the wrong
 * place for it — it lives on the session bar, where the work is. Stopping stays as a
 * fallback for a bar lost behind a full-screen window.
 */
function webCaptureItems(): Electron.MenuItemConstructorOptions[] {
  if (!isBrowserSessionActive()) {
    return [{ label: 'Capture a web app…', click: () => void beginBrowserSession() }]
  }
  return [{ label: 'Stop and save', click: () => void endBrowserSession() }]
}

/**
 * The menu bar item.
 *
 * Actions only, and only the ones with a right moment. It used to be the app's
 * navigation as well — Library, Settings, the save folder, About, an MCP submenu — which
 * is how snapit came to have five windows opened from a dropdown and no front door.
 * All of that lives in the window now, so this is left with the four things you reach for
 * without wanting to look at anything, plus a way back to the window and a way out.
 *
 * A capture is still one keystroke away whether the window is open or not, which is the
 * whole reason snapit stays resident.
 */
function buildTray(): void {
  const { screenshotHotkey, recordHotkey, gifHotkey } = getSettings()
  const template: Electron.MenuItemConstructorOptions[] = [
    // accelerator renders as native key symbols (⌘⇧9 on macOS, Ctrl+Shift+9 elsewhere);
    // registerAccelerator: false keeps it display-only — globalShortcut already fires it.
    {
      label: 'Screenshot',
      accelerator: screenshotHotkey,
      registerAccelerator: false,
      click: () => void startCapture('screenshot')
    },
    {
      label: 'Record',
      accelerator: recordHotkey,
      registerAccelerator: false,
      click: () => void startCapture('record')
    },
    {
      label: 'Record GIF',
      accelerator: gifHotkey,
      registerAccelerator: false,
      click: () => void startCapture('gif')
    },
    ...webCaptureItems(),
    { type: 'separator' },
    { label: 'Open snapit', click: () => openWindow('home') },
    { label: 'Quit snapit', click: () => app.quit() }
  ]
  // The one conditional row, and the only one that is not an action: a background app
  // that is never opened has nowhere else to learn there is a newer version.
  if (availableUpdate) {
    template.unshift(
      {
        label: `⬇  Update to v${availableUpdate.version}`,
        click: () => void shell.openExternal(availableUpdate!.downloadUrl)
      },
      { type: 'separator' }
    )
  }
  tray?.setContextMenu(Menu.buildFromTemplate(template))
}

/** Check GitHub for a newer release; update the tray and notify once when found. */
async function refreshUpdate(): Promise<void> {
  const found = await checkForUpdate()
  const isNew = found && found.version !== availableUpdate?.version
  availableUpdate = found
  buildTray()
  tray?.setToolTip(found ? `snapit — update available (v${found.version})` : 'snapit — QA capture')
  if (isNew && Notification.isSupported()) {
    new Notification({
      title: `snapit ${found.version} is available`,
      body: 'Open the tray menu to download the update.'
    }).show()
  }
}

function createTray(): void {
  // A real icon is required on Windows/Linux — an empty image leaves no visible tray
  // entry (and setTitle is macOS-only), so the app would have no entry point there.
  const isMac = process.platform === 'darwin'
  const icon = nativeImage.createFromDataURL(isMac ? TRAY_TEMPLATE_DATA_URL : TRAY_COLOUR_DATA_URL)
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('snapit — QA capture')
  buildTray()
}

function pngBuffer(dataUrl: string): Buffer {
  return nativeImage.createFromDataURL(dataUrl).toPNG()
}

/**
 * In dev the running binary is Electron, so the Dock shows its generic icon. Point
 * the Dock tile at snapit's real icon (downscaled to a Dock-appropriate size). Must
 * run after 'ready' and before any dock.show() so the image is in place. No-op in
 * packaged builds — those already carry the bundle's .icns.
 */
function applyDevDockIcon(): void {
  if (process.platform !== 'darwin' || !process.env['ELECTRON_RENDERER_URL']) return
  const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
  if (icon.isEmpty()) {
    console.warn('[snapit] dev dock icon not found at build/icon.png')
    return
  }
  app.dock?.setIcon(icon.resize({ width: 512, height: 512 }))
}

/**
 * Read an existing image from disk and show it in the app's editor route.
 *
 * It used to open a second window. That was one more window in an app that had five too
 * many, and it meant editing a screenshot took you out of the surface you were browsing
 * captures in. The image still arrives the same way — set here, fetched by the renderer
 * with `edit:get` — only the destination changed.
 */
async function openImageForEdit(filePath: string): Promise<void> {
  const ext = normalizeExt(filePath)
  const mime = mimeForPath(filePath)
  // Both checks, because `isEditableImage` goes by extension and the mime table is what
  // the data URL actually needs — a file this cannot name a type for cannot be shown.
  if (!isEditableImage(filePath) || mime === null) {
    notifyProblem('That file cannot be edited', `snapit can open ${EDITABLE_EXTENSIONS.join(', ')}.`)
    return
  }
  try {
    const bytes = await readFile(filePath)
    editSession = {
      path: filePath,
      name: basename(filePath),
      ext,
      mime,
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`
    }
  } catch (err) {
    notifyProblem('Could not open that image', err instanceof Error ? err.message : String(err))
    return
  }
  openWindow('home')
  const win = windowFor('home')
  const send = (): void => notifyWindow('home', 'edit:opened')
  if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** Prompt for an image file (tray fallback / dev entry point), then open it. */
async function openImageFromDialog(): Promise<void> {
  // The dock is hidden (accessory app), so the app isn't frontmost after a tray
  // click — without stealing focus the open panel opens behind other windows.
  if (process.platform === 'darwin') app.focus({ steal: true })
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: [...EDITABLE_EXTENSIONS] }]
    })
    if (!canceled && filePaths[0]) await openImageForEdit(filePaths[0])
  } catch (err) {
    console.error('[snapit] open-image dialog failed:', err)
  }
}

/** Regenerate the MCP bearer token (confirmed first) and disconnect anyone using the old one. */
async function regenerateMcpTokenWithConfirm(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Regenerate', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Regenerate the Claude Code (MCP) token?',
    detail:
      'The old token stops working immediately and any connected Claude Code session is ' +
      'disconnected. Re-run "Copy setup command" wherever you use it.'
  })
  if (response !== 0) return
  regenerateMcpToken()
  disconnectAllSessions()
  clipboard.writeText(mcpSetupCommand())
}

/** Pick an editable image path out of a process argv list (Windows/Linux open-with). */
function imagePathFromArgv(argv: string[]): string | null {
  // Scan from the end: the launched file is typically the last argument.
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i]
    if (isEditableImage(arg) && existsSync(arg)) return arg
  }
  return null
}

// Single-instance: snapit is a persistent tray app, so a second launch (e.g. a
// Finder "Open With" on Windows/Linux) must route the file to the running instance
// instead of spawning a duplicate tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = imagePathFromArgv(argv)
    if (filePath) void openImageForEdit(filePath)
  })
  // macOS delivers "Open With" / drag-to-dock via 'open-file'. It can fire before
  // the app is ready (cold start), so queue those paths and drain them in whenReady.
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (app.isReady()) void openImageForEdit(filePath)
    else pendingOpenPaths.push(filePath)
  })
}

// Before `whenReady` by requirement: a scheme cannot gain privileges once a page has
// loaded, and the home window's frame reads every capture over this one.
registerCaptureScheme()
// So a `hideOnClose` window stops cancelling its own close once Quit is under way.
watchForQuit()

app.whenReady().then(() => {
  // Lost the single-instance race: this process is exiting, do nothing.
  if (!app.hasSingleInstanceLock()) return

  if (process.platform === 'darwin') {
    app.dock?.hide()
    applyDevDockIcon()
  }

  // Kill the macOS spell-checker (NSSpellServer log spam, and we don't need it).
  electronSession.defaultSession.setSpellCheckerEnabled(false)

  // Content-Security-Policy — production only. The dev server + Vite HMR inject
  // inline/eval scripts and a websocket that a strict policy would break, so it's
  // applied only to the packaged file:// renderer.
  if (!process.env['ELECTRON_RENDERER_URL']) {
    electronSession.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      // A capture's report already carries its own, far stricter policy — see
      // `captureUrl.ts`. Adding this one on top does not tighten it: two policies on one
      // response are intersected, and this one has no 'unsafe-inline' for script, so the
      // report's Network panel and its seek script were both silently blocked.
      if (details.url.startsWith(`${CAPTURE_SCHEME}:`)) return cb({})
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
    })
  }

  // Hardening (Electron security checklist): the renderer may never spawn new
  // windows or navigate away from the app's own content. External links open in
  // the user's browser instead.
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (e, url) => {
      const dev = process.env['ELECTRON_RENDERER_URL']
      const allowed = dev ? url.startsWith(dev) : url.startsWith('file://')
      if (!allowed) {
        e.preventDefault()
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      }
    })
  })

  // Supply the recording source (and optional system/loopback audio) to
  // getDisplayMedia without the OS picker. recordWantsSystemAudio is set per
  // recording via 'record:prepare'; loopback audio uses ScreenCaptureKit (macOS 13+).
  electronSession.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const sessionSourceId =
            session?.mode === 'record' || session?.mode === 'gif' ? session.source.id : null
          const wanted = recordSourceId ?? sessionSourceId
          const source = sources.find((s) => s.id === wanted) ?? sources[0]
          // Loopback system audio relies on ScreenCaptureKit (macOS) / WASAPI (Windows);
          // Linux has no supported loopback, so omit it there rather than fail the stream.
          const loopback = recordWantsSystemAudio && process.platform !== 'linux'
          callback(source ? { video: source, audio: loopback ? 'loopback' : undefined } : {})
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )

  installCaptureProtocol()
  // A grant lets one frame read one capture; none of them should outlive the window
  // that asked for them.
  whenClosed('home', revokeCaptureAccess)

  createTray()
  registerHotkeys()
  // First run, before anything else asks for attention. The permission it exists to
  // explain is the one thing that makes every other part of snapit look broken.
  if (!getSettings().hasSeenWelcome) openWindow('welcome')
  void refreshUpdate()
  setInterval(() => void refreshUpdate(), UPDATE_CHECK_INTERVAL_MS)
  startMcpServer(app.getVersion(), {
    requestInteractiveCapture,
    // The tray reflects session state, so it has to be rebuilt when an agent is the one
    // starting or stopping — otherwise the menu offers Start while a session is running.
    startBrowserSession: async (url) => {
      await startBrowserSession(url)
      buildTray()
    },
    stopBrowserSession: async () => {
      try {
        return await stopBrowserSession()
      } finally {
        buildTray()
      }
    },
    isBrowserSessionActive
  })

  ipcMain.handle('capture:get-session', () => session)

  // The renderer reports it has painted the pushed frame; reveal the overlay now.
  // The renderer only says it painted; whether that reveal takes focus was decided
  // when the session was pushed.
  ipcMain.on('overlay:ready', () => doReveal(pendingActivate))

  ipcMain.on('capture:copy', (_event, dataUrl: string) => {
    if (!isImageDataUrl(dataUrl)) return
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    resolvePendingMcpCapture(dataUrl)
    closeOverlayWindow()
  })

  ipcMain.handle('capture:save', async (_event, dataUrl: string) => {
    if (!isImageDataUrl(dataUrl)) return null
    const { saveDir } = getSettings()
    await mkdir(saveDir, { recursive: true })
    const filePath = captureFilePath(saveDir, 'png')
    await writeFile(filePath, pngBuffer(dataUrl))
    refreshLibrary()
    showCaptureInApp(filePath)
    resolvePendingMcpCapture(dataUrl)
    closeOverlayWindow()
    return filePath
  })

  ipcMain.handle('capture:save-as', async (_event, dataUrl: string) => {
    if (!isImageDataUrl(dataUrl)) return null
    const { saveDir } = getSettings()
    const options = {
      defaultPath: captureFilePath(saveDir, 'png'),
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    }
    // Parent the dialog to the overlay so it appears above the always-on-top window.
    const result = overlayWindow
      ? await dialog.showSaveDialog(overlayWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, pngBuffer(dataUrl))
    // Revealed rather than shown in the app: Save-as puts it outside the save folder, so
    // the library has no entry to open.
    shell.showItemInFolder(result.filePath)
    resolvePendingMcpCapture(dataUrl)
    closeOverlayWindow()
    return result.filePath
  })

  ipcMain.on('overlay:close', closeOverlayWindow)

  // From the GIF setup panel: switch to a video recording instead (a better share
  // format for Slack/GitHub/Jira). Flag the next mode, then close the GIF overlay —
  // its 'closed' handler starts the record session after teardown, so the new
  // session isn't cleared by the outgoing window.
  // Offered from the record setup bar: what they actually want is the collector, not
  // a silent movie of a browser.
  // The session bar's two actions. Both are also reachable from the tray's single
  // entry, so a bar that ends up behind something is an inconvenience, not a trap.
  ipcMain.on('session:begin-capture', () => void startWebAppCapture())
  ipcMain.on('session:stop', () => void endBrowserSession())

  ipcMain.on('capture:web-app', () => {
    closeOverlayWindow()
    void beginBrowserSession()
  })

  ipcMain.on('capture:switch-to-record', () => {
    if (!session) {
      void startCapture('record')
      return
    }
    pendingCaptureMode = 'record'
    closeOverlayWindow()
  })

  ipcMain.handle('record:save', async (_event, data: ArrayBuffer, ext: string, details: unknown) => {
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0) return null
    return persistRecording(data, ext === 'mp4' ? 'mp4' : 'webm', details)
  })

  // Persist a client-side-encoded GIF (bytes from gifenc); closes the overlay.
  ipcMain.handle('gif:save', async (_event, data: ArrayBuffer, details: unknown) => {
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0) return null
    return persistRecording(data, 'gif', details)
  })

  // The image currently open for editing (renderer-safe subset — no disk path).
  ipcMain.handle('edit:get', () =>
    editSession ? { dataUrl: editSession.dataUrl, name: editSession.name, ext: editSession.ext } : null
  )

  // Overwrite the original file in place, after a confirmation (hard to reverse).
  // Writes only to the main-stored path — never a renderer-supplied one.
  ipcMain.handle('edit:save', async (_event, dataUrl: string) => {
    if (!editSession || !isImageDataUrl(dataUrl)) return null
    const target = editSession
    const confirmOptions = {
      type: 'warning' as const,
      buttons: ['Overwrite', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Overwrite the original image?',
      detail: target.path
    }
    const editor = windowFor('home')
    const { response } = editor
      ? await dialog.showMessageBox(editor, confirmOptions)
      : await dialog.showMessageBox(confirmOptions)
    if (response !== 0) return null
    await writeFile(target.path, bufferFromDataUrl(dataUrl))
    shell.showItemInFolder(target.path)
    leaveEditor()
    return target.path
  })

  // Save the edited image as a new file (a copy), preserving the original format.
  ipcMain.handle('edit:save-copy', async (_event, dataUrl: string) => {
    if (!editSession || !isImageDataUrl(dataUrl)) return null
    const target = editSession
    const { dir, name } = parse(target.path)
    const options = {
      defaultPath: join(dir, `${name} copy.${target.ext}`),
      filters: [{ name: 'Image', extensions: [target.ext] }]
    }
    const editor = windowFor('home')
    const result = editor
      ? await dialog.showSaveDialog(editor, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, bufferFromDataUrl(dataUrl))
    shell.showItemInFolder(result.filePath)
    leaveEditor()
    return result.filePath
  })

  ipcMain.on('edit:close', leaveEditor)

  // List capturable sources (each screen + each window) with preview thumbnails.
  ipcMain.handle('record:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 }
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? ('screen' as const) : ('window' as const),
      thumbnail: s.thumbnail.toDataURL()
    }))
  })

  // Set before each recording: system/loopback audio + which source to capture.
  // Also exclude the overlay (and its Stop pill) from screen capture so it stays
  // visible to the user but never lands in the recording. macOS sets the window's
  // NSWindowSharingType to none (Windows: SetWindowDisplayAffinity); showOverlay
  // resets it to off before each capture. No-op on Linux — the pill stays in recordings there.
  ipcMain.handle('record:prepare', (_event, opts: { systemAudio: boolean; sourceId: string }) => {
    recordWantsSystemAudio = opts.systemAudio
    recordSourceId = opts.sourceId
    recordStartedAt = Date.now()
    recordSource = null
    setMarkerHotkey(true)
    // Deliberately not awaited: this sits on the path to getDisplayMedia, and a
    // recording lasts orders of magnitude longer than the lookup. The name is only
    // read when the capture is saved, by which time this has long since resolved.
    void desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const match = sources.find((s) => s.id === opts.sourceId)
        if (!match) return
        recordSource = {
          id: match.id,
          name: match.name,
          type: match.id.startsWith('screen') ? ('screen' as const) : ('window' as const)
        }
      })
      .catch((err) => console.warn('[snapit] could not resolve the capture source name:', err))
    overlayWindow?.setContentProtection(true)
  })

  // Make the overlay click-through while recording so the screen stays usable;
  // the renderer flips it back on when the pointer is over the Stop pill.
  ipcMain.on('record:set-ignore-mouse', (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true })
  })

  ipcMain.handle('welcome:permission', () =>
    process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'not-applicable'
  )
  ipcMain.on('welcome:open-settings', () => void shell.openExternal(SCREEN_SETTINGS_URL))
  ipcMain.on('welcome:done', () => {
    markWelcomeSeen()
    closeWindow('welcome')
  })

  ipcMain.handle('library:list', () => listLibrary(getSettings().saveDir))
  // Fetched per tile rather than with the list: a thumbnail goes through the OS
  // thumbnail service, and forty of those would hold up the window painting at all.
  ipcMain.handle('library:thumbnail', (_event, path: string) => {
    try {
      return thumbnailFor(assertInside(getSettings().saveDir, path))
    } catch {
      return null
    }
  })
  /**
   * What the shell's sidebar reports. Polled, because none of it is an event this
   * process sees: a permission is granted in another application, and an agent
   * attaching over MCP is a socket opening, not a notification.
   */
  ipcMain.handle('shell:status', () => ({
    screenPermission:
      process.platform === 'darwin'
        ? systemPreferences.getMediaAccessStatus('screen')
        : ('not-applicable' as const),
    sessionPhase: sessionPhase(),
    mcp: mcpState(mcpActivity()),
    saveDir: getSettings().saveDir,
    version: app.getVersion()
  }))

  // Reads every HAR in the window, so it is asked for when the route opens rather than
  // polled. `analyticsSource` caches until the folder changes.
  ipcMain.handle('analytics:read', () => readAnalytics(getSettings().saveDir))

  ipcMain.on('app:open-save-folder', () => void shell.openPath(getSettings().saveDir))
  ipcMain.handle('mcp:setup-command', () => mcpSetupCommand())
  ipcMain.handle('mcp:regenerate', () => regenerateMcpTokenWithConfirm())
  ipcMain.on('app:copy-text', (_event, text: unknown) => clipboard.writeText(str(text)))
  ipcMain.on('session:start', () => void beginBrowserSession())

  /**
   * Start a capture from the app's own UI.
   *
   * The window goes away first. A screenshot of the screen taken from a button inside
   * snapit would otherwise have snapit in it, which is never what was wanted — and the
   * region selector needs to see what is behind us. It comes back when the capture is
   * dismissed or saved, so pressing a button in the app returns you to the app.
   */
  ipcMain.on('capture:start', (_event, mode: unknown) => {
    if (mode !== 'screenshot' && mode !== 'record' && mode !== 'gif') return
    const home = windowFor('home')
    if (home?.isVisible()) {
      restoreHomeAfterCapture = true
      home.hide()
    }
    void startCapture(mode)
  })

  ipcMain.handle('app:open-image', () => openImageFromDialog())

  // Where the home window should show this capture from. Everything about what that URL
  // may address, and what the document served from it may do, is in `captureUrl.ts`.
  ipcMain.handle('home:view', (_event, path: string) => captureView(getSettings().saveDir, path))

  ipcMain.handle('library:open', (_event, path: string) => {
    try {
      return shell.openPath(assertInside(getSettings().saveDir, path))
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  })
  ipcMain.on('library:reveal', (_event, path: string) => {
    try {
      shell.showItemInFolder(assertInside(getSettings().saveDir, path))
    } catch (err) {
      console.warn('[snapit] refused to reveal a path outside the save folder:', err)
    }
  })
  /**
   * Rename a capture. Resolves to the new path, or rejects with a reason the field can
   * show — `captureName.ts` refuses rather than sanitising, so every rejection names the
   * rule it hit.
   */
  ipcMain.handle('library:rename', async (_event, path: string, name: unknown) => {
    const to = await renameCapture(getSettings().saveDir, path, str(name))
    refreshLibrary()
    return to
  })

  /**
   * Replace a capture's markers. Returns what was stored, sanitized — the caller shows
   * that rather than what it sent, so a marker the store clamped or dropped cannot sit
   * in the editor claiming otherwise.
   */
  ipcMain.handle('library:set-markers', async (_event, path: string, markers: unknown) => {
    const saved = await setCaptureMarkers(getSettings().saveDir, path, markers)
    // The list shows a marker count, and the report is rendered per request — so both
    // surfaces are already correct once this has landed.
    refreshLibrary()
    return saved
  })

  ipcMain.handle('library:copy-markdown', (_event, path: string) => copyReportAsMarkdown(path))
  // The whole flow — size decision, save dialog, streaming write — lives in share.ts.
  ipcMain.handle('library:share', (_event, path: string) =>
    shareCapture(getSettings().saveDir, path, windowFor('home'))
  )
  ipcMain.handle('library:edit', async (_event, path: string) => {
    try {
      await openImageForEdit(assertInside(getSettings().saveDir, path))
    } catch (err) {
      console.warn('[snapit] could not open that capture for editing:', err)
    }
  })
  /**
   * Confirmed here rather than in the renderer: this is the one irreversible thing the
   * library does, and a native dialog is the one prompt a user cannot mistake for part
   * of the page. It goes to the trash, so "irreversible" is really "inconvenient".
   */
  ipcMain.handle('library:delete', async (_event, path: string, name: string) => {
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Move "${name}" to the Trash?`,
      detail: 'Everything in this capture goes with it — the recording, the report and the collected data.'
    }
    const home = windowFor('home')
    const { response } = home
      ? await dialog.showMessageBox(home, options)
      : await dialog.showMessageBox(options)
    if (response !== 0) return false
    try {
      await deleteCapture(getSettings().saveDir, path)
      return true
    } catch (err) {
      void dialog.showMessageBox({
        type: 'error',
        message: 'Could not delete that capture',
        detail: err instanceof Error ? err.message : String(err)
      })
      return false
    }
  })

  ipcMain.handle('app:get-info', () => ({ version: app.getVersion() }))
  // Renderer-discovered failures go through the same notification path as main's own.
  ipcMain.on('app:report-problem', (_event, title: unknown, body: unknown) => {
    notifyProblem(str(title).slice(0, 120) || 'Something went wrong', str(body).slice(0, 400))
  })

  ipcMain.on('app:open-external', (_event, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  // Fresh on-demand check from the About window; also refreshes the tray/state.
  ipcMain.handle('app:check-update', async () => {
    await refreshUpdate()
    return availableUpdate
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_event, partial: Partial<Settings>) => {
    const next = setSettings(partial)
    registerHotkeys()
    buildTray()
    return next
  })
  ipcMain.handle('settings:browse-dir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  // Open any image the app was launched to edit: macOS queues them via 'open-file';
  // Windows/Linux pass the path in this first instance's argv.
  const startupPaths = [...pendingOpenPaths]
  pendingOpenPaths.length = 0
  if (process.platform !== 'darwin') {
    const argvPath = imagePathFromArgv(process.argv)
    if (argvPath) startupPaths.push(argvPath)
  }
  for (const filePath of startupPaths) void openImageForEdit(filePath)
})

// Tray app: stay alive when windows close.
app.on('window-all-closed', () => {
  // Intentionally do nothing — quitting happens only via the tray menu.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopMcpServer()
})
