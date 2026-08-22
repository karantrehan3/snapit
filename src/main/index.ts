import { basename, join, parse } from 'path'
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
import { getSettings, setSettings, regenerateMcpToken, type Settings } from './settings'
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
import { isBrowserSessionActive, startBrowserSession, stopBrowserSession } from './browserSession'
import { renderReport } from './report'
import {
  EDITABLE_EXTENSIONS,
  bufferFromDataUrl,
  isEditableImage,
  mimeForPath,
  normalizeExt
} from './imageFile'
import { TRAY_TEMPLATE_DATA_URL, TRAY_COLOUR_DATA_URL } from './trayIcon'
import { startMcpServer, stopMcpServer, disconnectAllSessions, mcpSetupCommand } from './mcp/httpServer'

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
  | { mode: 'record'; source: DisplaySource }
  | { mode: 'gif'; source: DisplaySource }
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
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
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
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'"
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
    shell.showItemInFolder(mediaPath)
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

  const layout = bundleLayout(saveDir, captureBaseName(), ext)
  await mkdir(layout.dir, { recursive: true })
  await writeFile(layout.mediaPath, bytes)
  const reported = (details as { durationMs?: unknown } | null)?.durationMs
  const durationMs = resolveDurationMs(
    reported,
    recordStartedAt === null ? null : Date.now() - recordStartedAt
  )

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
      markers: sanitizeMarkers((details as { markers?: unknown } | null)?.markers, durationMs),
      mediaName: layout.mediaName,
      mediaBytes: bytes.byteLength,
      ext
    })
    await writeFile(layout.metaPath, JSON.stringify(meta, null, 2))
    await writeFile(layout.reportPath, renderReport(meta))
  } catch (err) {
    console.error('[snapit] recording saved, but its report could not be written:', err)
  }

  return finish(layout.mediaPath)
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

function revealWhenPainted(): void {
  if (revealFallback) clearTimeout(revealFallback)
  revealFallback = setTimeout(doReveal, 400)
}

function doReveal(): void {
  if (!revealFallback) return
  clearTimeout(revealFallback)
  revealFallback = null
  revealOverlay()
}

/** Position the reused overlay on the cursor's display and push the session to it. */
function showOverlay(display: Display): void {
  const win = ensureOverlayWindow()
  win.setBounds(display.bounds)
  // Reset state a prior recording may have left on (window is reused, not recreated).
  win.setContentProtection(false)
  win.setIgnoreMouseEvents(false)

  const push = (): void => {
    win.webContents.send('capture:session', session)
    revealWhenPainted()
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

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 430,
    resizable: false,
    title: 'snapit Settings',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false
    }
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  settingsWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin') app.focus({ steal: true })
    settingsWindow?.focus()
  })
  loadRenderer(settingsWindow, 'settings')
}

function openAboutWindow(): void {
  if (aboutWindow) {
    aboutWindow.focus()
    return
  }
  aboutWindow = new BrowserWindow({
    width: 380,
    height: 520,
    resizable: false,
    title: 'About snapit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false
    }
  })
  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
  aboutWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin') app.focus({ steal: true })
    aboutWindow?.focus()
  })
  loadRenderer(aboutWindow, 'about')
}

/** Load the shared renderer, optionally at a hash route (e.g. "settings"). */
function loadRenderer(win: BrowserWindow, hash = ''): void {
  const suffix = hash ? `#${hash}` : ''
  forwardRendererConsole(win)
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${suffix}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

/**
 * Mirror renderer warnings and errors into the terminal during development.
 *
 * Without this, anything thrown in an overlay is only visible if you happen to have that
 * window's devtools open — and the overlay is transparent, click-through and short-lived,
 * so in practice nobody does. Recording bugs in particular were invisible.
 */
function forwardRendererConsole(win: BrowserWindow): void {
  if (!process.env['ELECTRON_RENDERER_URL']) return
  win.webContents.on('console-message', (details) => {
    // Warnings and errors only — forwarding every level buries them in framework chatter.
    if (details.level !== 'warning' && details.level !== 'error') return
    const where = details.sourceId ? ` (${details.sourceId}:${details.lineNumber})` : ''
    console.log(`[renderer:${details.level}] ${details.message}${where}`)
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error(`[renderer] process gone: ${d.reason} (exit ${d.exitCode})`)
  })
  win.webContents.on('preload-error', (_e, path, err) => {
    console.error(`[renderer] preload error in ${path}: ${err.message}`)
  })
}

/** Log screen-recording status and, if not granted, open the Settings pane. */
function ensureScreenPermission(): void {
  if (process.platform !== 'darwin') return
  const status = systemPreferences.getMediaAccessStatus('screen')
  console.log(`[snapit] screen-recording permission: ${status}`)
  if (status !== 'granted') {
    console.warn(
      '[snapit] Screen Recording not granted. NOTE: when launched from a terminal, ' +
        'the permission belongs to the TERMINAL app — grant it there, then relaunch.'
    )
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }
}

async function startCapture(mode: CaptureMode): Promise<void> {
  if (session) {
    // A second record/gif hotkey press stops & saves; otherwise just dismiss.
    if (session.mode === 'record' || session.mode === 'gif') overlayWindow?.webContents.send('record:stop')
    else closeOverlayWindow()
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
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`[snapit] capture failed: ${detail}`)
      return
    }
  } else {
    // record and gif both capture a live display source; only the encoding differs.
    try {
      session = { mode, workArea: windowWorkArea(display), source: await getDisplaySource(display) }
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
 * Put the most recent bundle on the clipboard as Markdown, ready to paste into a
 * ticket, a pull request or a chat.
 *
 * This is the whole integration story on purpose. snapit does not talk to Jira, Linear
 * or Slack: whoever files the ticket is already signed in to it, and a paste costs them
 * one keystroke against an OAuth flow and a token to keep alive here.
 */
async function copyLatestReportAsMarkdown(): Promise<void> {
  try {
    const { saveDir } = getSettings()
    const dir = await targetBundle(saveDir)
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

/**
 * Open Chrome under snapit's control. The tray is rebuilt so the item flips to Stop —
 * a session that is running with no visible sign of it would be a surprise, given it
 * records everything the browser does.
 */
async function beginBrowserSession(): Promise<void> {
  try {
    await startBrowserSession()
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
  try {
    await stopBrowserSession()
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
    { label: 'Open image…', click: () => void openImageFromDialog() },
    { type: 'separator' },
    isBrowserSessionActive()
      ? { label: '⏹  Stop browser session', click: () => void endBrowserSession() }
      : { label: 'Start browser session…', click: () => void beginBrowserSession() },
    { type: 'separator' },
    { label: 'Settings…', click: openSettingsWindow },
    { label: 'Open save folder', click: () => void shell.openPath(getSettings().saveDir) },
    { label: 'Copy last report as Markdown', click: () => void copyLatestReportAsMarkdown() },
    {
      label: 'Claude Code (MCP)',
      submenu: [
        { label: 'Copy setup command', click: () => clipboard.writeText(mcpSetupCommand()) },
        { label: 'Regenerate token…', click: () => void regenerateMcpTokenWithConfirm() }
      ]
    },
    { label: 'About snapit', click: openAboutWindow },
    { type: 'separator' },
    { label: 'Quit snapit', click: () => app.quit() }
  ]
  // Surface an available update at the very top so it's the first thing seen.
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

function openEditorWindow(): void {
  if (editorWindow) {
    // Replace the current image with the just-opened one (editSession is already set).
    editorWindow.focus()
    editorWindow.webContents.reload()
    return
  }
  editorWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 480,
    minHeight: 360,
    title: 'snapit — Edit image',
    backgroundColor: '#1e1e20',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false
    }
  })
  editorWindow.on('closed', () => {
    editorWindow = null
    editSession = null
    // Back to a background accessory app once the document window is gone.
    if (process.platform === 'darwin') void app.dock?.hide()
  })
  editorWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin') app.focus({ steal: true })
    editorWindow?.focus()
  })
  // Unlike the capture overlays, the editor is a real document window — give it a
  // Dock icon (and app switcher entry) while it's open. The icon image itself is
  // applied once at startup (applyDevDockIcon) so it's already in place here.
  if (process.platform === 'darwin') void app.dock?.show()
  loadRenderer(editorWindow, 'edit')
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

function closeEditorWindow(): void {
  editorWindow?.close()
  editorWindow = null
  editSession = null
}

/** Read an existing image from disk and open it in the editor window. */
async function openImageForEdit(filePath: string): Promise<void> {
  if (!isEditableImage(filePath)) {
    console.warn(`[snapit] refusing to open unsupported file: ${filePath}`)
    return
  }
  const mime = mimeForPath(filePath)
  if (!mime) return
  let bytes: Buffer
  try {
    bytes = await readFile(filePath)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[snapit] failed to read image ${filePath}: ${detail}`)
    return
  }
  editSession = {
    path: filePath,
    name: parse(filePath).base,
    ext: normalizeExt(filePath),
    mime,
    dataUrl: `data:${mime};base64,${bytes.toString('base64')}`
  }
  console.log(`[snapit] opening image for edit: ${filePath} (${bytes.length} bytes)`)
  openEditorWindow()
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

  createTray()
  registerHotkeys()
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
  ipcMain.on('overlay:ready', doReveal)

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
    shell.showItemInFolder(filePath)
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
    const { response } = editorWindow
      ? await dialog.showMessageBox(editorWindow, confirmOptions)
      : await dialog.showMessageBox(confirmOptions)
    if (response !== 0) return null
    await writeFile(target.path, bufferFromDataUrl(dataUrl))
    shell.showItemInFolder(target.path)
    closeEditorWindow()
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
    const result = editorWindow
      ? await dialog.showSaveDialog(editorWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, bufferFromDataUrl(dataUrl))
    shell.showItemInFolder(result.filePath)
    closeEditorWindow()
    return result.filePath
  })

  ipcMain.on('edit:close', closeEditorWindow)

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

  ipcMain.handle('app:get-info', () => ({ version: app.getVersion() }))
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
