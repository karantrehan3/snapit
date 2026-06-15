import { join } from 'path'
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  clipboard,
  nativeImage,
  shell,
  systemPreferences,
  type Display
} from 'electron'
import { captureDisplay } from './capture'

/**
 * snapit shell.
 *
 * Runs in the background (menubar/tray). Two distinct capture modes, each with
 * its own global hotkey:
 *   - screenshot (Cmd/Ctrl+Shift+9): freeze the display, drag-select, crop → clipboard.
 *   - record     (Cmd/Ctrl+Shift+8): live overlay; video recording lands in Phase 2.
 *
 * Both modes require macOS Screen Recording permission (they read screen pixels).
 */

// TODO(1d): make hotkeys configurable via settings.
const SCREENSHOT_HOTKEY = 'CommandOrControl+Shift+9'
const RECORD_HOTKEY = 'CommandOrControl+Shift+8'

type CaptureMode = 'screenshot' | 'record'

type Frame = {
  dataUrl: string
  /** Display width in DIP (CSS pixels). */
  width: number
  /** Display height in DIP (CSS pixels). */
  height: number
  /** Device pixel ratio of the captured display. */
  scaleFactor: number
}

/** What the overlay renderer needs to know about the current capture session. */
type CaptureSession = { mode: 'screenshot'; frame: Frame } | { mode: 'record' }

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let session: CaptureSession | null = null

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
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show()
    overlayWindow?.focus()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    session = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function closeOverlayWindow(): void {
  overlayWindow?.close()
  overlayWindow = null
  session = null
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
  // A hotkey while the overlay is open acts as cancel.
  if (overlayWindow) {
    closeOverlayWindow()
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)

  if (mode === 'screenshot') {
    ensureScreenPermission()
    try {
      // Capture BEFORE the overlay is shown so the overlay isn't in the frame.
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
    // Phase 2: capture video here (also requires Screen Recording permission).
    session = { mode: 'record' }
  }

  createOverlayWindow(display)
}

function createTray(): void {
  // Phase 1 uses a text title in the menubar; a proper template icon comes later.
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('snapit')
  tray.setToolTip('snapit — QA capture')

  const menu = Menu.buildFromTemplate([
    { label: `Screenshot  (${SCREENSHOT_HOTKEY})`, click: () => void startCapture('screenshot') },
    { label: `Record  (${RECORD_HOTKEY})`, click: () => void startCapture('record') },
    { type: 'separator' },
    { label: 'Quit snapit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  createTray()

  const ok1 = globalShortcut.register(SCREENSHOT_HOTKEY, () => void startCapture('screenshot'))
  const ok2 = globalShortcut.register(RECORD_HOTKEY, () => void startCapture('record'))
  if (!ok1) console.error(`[snapit] Failed to register hotkey: ${SCREENSHOT_HOTKEY}`)
  if (!ok2) console.error(`[snapit] Failed to register hotkey: ${RECORD_HOTKEY}`)

  ipcMain.handle('capture:get-session', () => session)

  ipcMain.on('capture:copy', (_event, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    closeOverlayWindow()
  })

  ipcMain.on('overlay:close', closeOverlayWindow)
})

// Tray app: stay alive when the overlay window closes.
app.on('window-all-closed', () => {
  // Intentionally do nothing — quitting happens only via the tray menu.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
