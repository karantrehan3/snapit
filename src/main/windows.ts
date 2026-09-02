import { join } from 'path'
import { app, BrowserWindow, nativeTheme } from 'electron'

/**
 * The app's ordinary windows.
 *
 * There were five of these in `index.ts` and they were the same function five times:
 * focus the one that is already open, otherwise construct it, null the handle when it
 * closes, steal focus once it has painted, and load the shared renderer at a hash. The
 * only real differences were a size, a title and whether it resizes — so those are the
 * arguments, and everything else is here once.
 *
 * The capture overlay is deliberately not one of these. It is created once and reused
 * because macOS takes seconds to present a transparent full-screen window, it is shown
 * and hidden rather than opened and closed, and it reveals only when the renderer says
 * it has painted. None of that is this shape, and forcing it in would mean an options
 * bag with a branch for every field.
 *
 * The image editor used to be here. It is a route of the home window now — one fewer
 * window, and editing a screenshot no longer takes you out of the list you found it in.
 */

export type WindowRoute = 'home' | 'welcome' | 'gallery'

type Spec = {
  title: string
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  resizable?: boolean
  backgroundColor?: string
  /**
   * A real document window rather than a panel: it gets a Dock icon and an app-switcher
   * entry while it is open, and the app goes back to being an accessory when it closes.
   */
  document?: boolean
  /** Reload rather than focus when it is already open, for a window showing one thing. */
  reloadIfOpen?: boolean
  /**
   * Open filled to the work area, which is what double-clicking a title bar does. The
   * width and height above stay as the size it un-zooms to.
   */
  zoomed?: boolean
  /**
   * Closing hides rather than destroys, so the window comes back where it was left —
   * same route, same scroll, same selected capture — and reopening is instant.
   *
   * This is what makes snapit behave like an application that happens to live in the
   * menu bar rather than a menu that happens to open windows. The app stays running
   * either way; what changes is that its state survives the close.
   */
  hideOnClose?: boolean
}

/**
 * Set once `before-quit` fires, so a `hideOnClose` window stops intercepting its close
 * and actually goes away.
 *
 * Without this, Quit is silently impossible: `app.quit()` closes every window, our
 * handler cancels each one, and the app carries on running with nothing on screen.
 */
let quitting = false

export function watchForQuit(): void {
  app.on('before-quit', () => {
    quitting = true
  })
}

/**
 * What the window is filled with before the renderer has painted anything.
 *
 * It has to match what the page is about to paint or the window flashes the wrong
 * colour on open — which is most visible on the largest window, and was a white flash
 * on a dark desktop. These two values are `--surface` from `tokens.css` in each scheme;
 * they are duplicated here because the main process cannot read a stylesheet, and they
 * are the only two that are.
 */
const GROUND = { light: '#f5f6f8', dark: '#0e1116' }

const SPECS: Record<WindowRoute, Spec> = {
  // Resizable, and the largest, because it holds a capture beside a list of them.
  // Zoomed, because the report is the widest thing snapit renders and the sidebar has
  // already taken 202px off it. The size above is what it restores to.
  home: {
    title: 'snapit',
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 520,
    zoomed: true,
    // A real application window: it gets a Dock icon and an app-switcher entry while it
    // is open, and closing it puts snapit back in the menu bar with its state intact.
    document: true,
    hideOnClose: true
  },
  welcome: { title: 'Welcome to snapit', width: 520, height: 620, resizable: false },
  gallery: { title: 'snapit — Components', width: 1180, height: 860 }
}

const open = new Map<WindowRoute, BrowserWindow>()

/** Runs when a window closes, so a caller can drop whatever state belonged to it. */
const onClosed = new Map<WindowRoute, () => void>()

export function whenClosed(route: WindowRoute, run: () => void): void {
  onClosed.set(route, run)
}

export const windowFor = (route: WindowRoute): BrowserWindow | null => open.get(route) ?? null

/** Send to a window if it is open. A closed window is not a failure to deliver to. */
export function notifyWindow(route: WindowRoute, channel: string, ...args: unknown[]): void {
  open.get(route)?.webContents.send(channel, ...args)
}

export function openWindow(route: WindowRoute): BrowserWindow {
  const existing = open.get(route)
  if (existing) {
    // It may be hidden rather than closed, which is the point of `hideOnClose`.
    if (!existing.isVisible()) existing.show()
    if (SPECS[route].document && process.platform === 'darwin') void app.dock?.show()
    existing.focus()
    if (SPECS[route].reloadIfOpen) existing.webContents.reload()
    return existing
  }

  const spec = SPECS[route]
  const win = new BrowserWindow({
    width: spec.width,
    height: spec.height,
    ...(spec.minWidth ? { minWidth: spec.minWidth } : {}),
    ...(spec.minHeight ? { minHeight: spec.minHeight } : {}),
    ...(spec.resizable === false ? { resizable: false } : {}),
    title: spec.title,
    backgroundColor: spec.backgroundColor ?? (nativeTheme.shouldUseDarkColors ? GROUND.dark : GROUND.light),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: false
    }
  })
  open.set(route, win)

  if (spec.hideOnClose) {
    win.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      win.hide()
      // Back to a background accessory app: no Dock icon, no app-switcher entry, still
      // capturing on a hotkey.
      if (spec.document && process.platform === 'darwin') void app.dock?.hide()
    })
  }

  win.on('closed', () => {
    open.delete(route)
    onClosed.get(route)?.()
    // Back to a background accessory app once the document window is gone.
    if (spec.document && process.platform === 'darwin') void app.dock?.hide()
  })

  win.once('ready-to-show', () => {
    // Before focusing, so the window is never briefly seen at its unzoomed size.
    if (spec.zoomed) win.maximize()
    // The Dock is hidden (accessory app), so the app has to be activated explicitly or
    // the window never becomes key and nothing in it can be typed into.
    if (process.platform === 'darwin') app.focus({ steal: true })
    win.focus()
  })

  // The icon image itself is applied once at startup, so it is already in place here.
  if (spec.document && process.platform === 'darwin') void app.dock?.show()

  loadRenderer(win, route)
  return win
}

export function closeWindow(route: WindowRoute): void {
  open.get(route)?.close()
  open.delete(route)
}

/** Load the shared renderer, optionally at a hash route (e.g. "settings"). */
export function loadRenderer(win: BrowserWindow, hash = ''): void {
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
export function forwardRendererConsole(win: BrowserWindow): void {
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
