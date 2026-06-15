import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
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
  session as electronSession,
  systemPreferences,
  type Display
} from 'electron'
import { captureDisplay, getDisplaySource, type DisplaySource } from './capture'
import { getSettings, setSettings, type Settings } from './settings'

/**
 * snapit shell.
 *
 * Background tray app with two capture modes behind configurable global hotkeys:
 *   - screenshot: freeze the display, drag-select, annotate → copy / save.
 *   - record: full-screen or region screen recording (optional mic) → .webm.
 *
 * Captures can be copied to the clipboard, saved to a default folder, or saved-as
 * via a dialog. Hotkeys and the save folder are editable in the settings window.
 */

type CaptureMode = 'screenshot' | 'record'

type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

type CaptureSession = { mode: 'screenshot'; frame: Frame } | { mode: 'record'; source: DisplaySource }

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let session: CaptureSession | null = null
let recordWantsSystemAudio = false
let recordSourceId: string | null = null

function createOverlayWindow(display: Display): void {
  const { x, y, width, height } = display.bounds

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
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
      sandbox: false,
      spellcheck: false
    }
  })

  // NOTE: do NOT use the 'screen-saver' level — windows at that level cannot become
  // the macOS key window, which blocks keyboard focus (text annotation can't be typed).
  // The default floating always-on-top still sits above normal windows AND can be key.
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show()
    // The Dock is hidden (accessory app), so explicitly activate the app — otherwise
    // the window never becomes "key" and HTML inputs (text annotation) can't be typed.
    if (process.platform === 'darwin') app.focus({ steal: true })
    overlayWindow?.focus()
    overlayWindow?.webContents.focus()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    session = null
  })

  loadRenderer(overlayWindow)
}

function closeOverlayWindow(): void {
  overlayWindow?.close()
  overlayWindow = null
  session = null
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    title: 'snapit Settings',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
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

/** Load the shared renderer, optionally at a hash route (e.g. "settings"). */
function loadRenderer(win: BrowserWindow, hash = ''): void {
  const suffix = hash ? `#${hash}` : ''
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${suffix}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
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
  if (overlayWindow) {
    // A second record hotkey press stops & saves; otherwise just dismiss.
    if (session?.mode === 'record') overlayWindow.webContents.send('record:stop')
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
    try {
      session = { mode: 'record', source: await getDisplaySource(display) }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`[snapit] record source failed: ${detail}`)
      return
    }
  }

  createOverlayWindow(display)
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const { screenshotHotkey, recordHotkey } = getSettings()
  if (!globalShortcut.register(screenshotHotkey, () => void startCapture('screenshot'))) {
    console.error(`[snapit] Failed to register screenshot hotkey: ${screenshotHotkey}`)
  }
  if (!globalShortcut.register(recordHotkey, () => void startCapture('record'))) {
    console.error(`[snapit] Failed to register record hotkey: ${recordHotkey}`)
  }
}

function buildTray(): void {
  const { screenshotHotkey, recordHotkey } = getSettings()
  const menu = Menu.buildFromTemplate([
    { label: `Screenshot  (${screenshotHotkey})`, click: () => void startCapture('screenshot') },
    { label: `Record  (${recordHotkey})`, click: () => void startCapture('record') },
    { type: 'separator' },
    { label: 'Settings…', click: openSettingsWindow },
    { label: 'Open save folder', click: () => void shell.openPath(getSettings().saveDir) },
    { type: 'separator' },
    { label: 'Quit snapit', click: () => app.quit() }
  ])
  tray?.setContextMenu(menu)
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('snapit')
  tray.setToolTip('snapit — QA capture')
  buildTray()
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

function pngBuffer(dataUrl: string): Buffer {
  return nativeImage.createFromDataURL(dataUrl).toPNG()
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  // Kill the macOS spell-checker (NSSpellServer log spam, and we don't need it).
  electronSession.defaultSession.setSpellCheckerEnabled(false)

  // Supply the recording source (and optional system/loopback audio) to
  // getDisplayMedia without the OS picker. recordWantsSystemAudio is set per
  // recording via 'record:prepare'; loopback audio uses ScreenCaptureKit (macOS 13+).
  electronSession.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const wanted = recordSourceId ?? (session?.mode === 'record' ? session.source.id : null)
          const source = sources.find((s) => s.id === wanted) ?? sources[0]
          callback(source ? { video: source, audio: recordWantsSystemAudio ? 'loopback' : undefined } : {})
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )

  createTray()
  registerHotkeys()

  ipcMain.handle('capture:get-session', () => session)

  ipcMain.on('capture:copy', (_event, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    closeOverlayWindow()
  })

  ipcMain.handle('capture:save', async (_event, dataUrl: string) => {
    const { saveDir } = getSettings()
    await mkdir(saveDir, { recursive: true })
    const filePath = join(saveDir, `snapit-${timestamp()}.png`)
    await writeFile(filePath, pngBuffer(dataUrl))
    shell.showItemInFolder(filePath)
    closeOverlayWindow()
    return filePath
  })

  ipcMain.handle('capture:save-as', async (_event, dataUrl: string) => {
    const { saveDir } = getSettings()
    const options = {
      defaultPath: join(saveDir, `snapit-${timestamp()}.png`),
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    }
    // Parent the dialog to the overlay so it appears above the always-on-top window.
    const result = overlayWindow
      ? await dialog.showSaveDialog(overlayWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, pngBuffer(dataUrl))
    shell.showItemInFolder(result.filePath)
    closeOverlayWindow()
    return result.filePath
  })

  ipcMain.on('overlay:close', closeOverlayWindow)

  ipcMain.handle('record:save', async (_event, data: ArrayBuffer, ext: string) => {
    const safeExt = ext === 'mp4' ? 'mp4' : 'webm'
    const { saveDir } = getSettings()
    await mkdir(saveDir, { recursive: true })
    const filePath = join(saveDir, `snapit-${timestamp()}.${safeExt}`)
    await writeFile(filePath, Buffer.from(data))
    shell.showItemInFolder(filePath)
    closeOverlayWindow()
    return filePath
  })

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
  // NSWindowSharingType to none; a fresh overlay per session defaults back to off.
  ipcMain.handle('record:prepare', (_event, opts: { systemAudio: boolean; sourceId: string }) => {
    recordWantsSystemAudio = opts.systemAudio
    recordSourceId = opts.sourceId
    overlayWindow?.setContentProtection(true)
  })

  // Make the overlay click-through while recording so the screen stays usable;
  // the renderer flips it back on when the pointer is over the Stop pill.
  ipcMain.on('record:set-ignore-mouse', (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true })
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
})

// Tray app: stay alive when windows close.
app.on('window-all-closed', () => {
  // Intentionally do nothing — quitting happens only via the tray menu.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
