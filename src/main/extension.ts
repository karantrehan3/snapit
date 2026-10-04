import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app, dialog, shell, type BrowserWindow } from 'electron'

/**
 * Where the Chrome extension lives, and when it may pair.
 *
 * It is loaded by hand — Chrome 137 removed `--load-extension` from branded builds, so
 * snapit cannot install or side-load it for anybody. The app's job is therefore to make
 * the folder easy to find and to say whether the thing that turned up is really ours.
 *
 * Packaged under `extraResources` rather than inside the asar, because Chrome needs a
 * real directory on disk and an asar is not one.
 */

/** Minutes, not seconds: somebody is walking between two windows to do this. */
const PAIRING_WINDOW_MS = 5 * 60 * 1000

/** The extension this build speaks to. A major mismatch is refused at session start. */
export const EXPECTED_EXTENSION_VERSION = '0.1.0'

/**
 * The first candidate that actually holds a manifest.
 *
 * Guessing one path was wrong, because `app.getAppPath()` follows whatever entry script
 * Electron was given — the project root under `electron-vite`, but the script's own
 * directory under a bare `electron out/main/index.js`. The symptom was not an error: the
 * id came back empty, so the bridge refused the real extension as "not the snapit
 * extension", which is a confusing way to say "I could not find my own folder".
 *
 * So all three are tried and the first that exists wins. `__dirname` is the reliable one
 * in development — this file is compiled to `out/main/index.js`, two levels under the
 * repository root — and `resourcesPath` is the reliable one once packaged.
 */
function candidates(): string[] {
  // `process.resourcesPath` is undefined outside Electron, and `join` throws on
  // undefined rather than ignoring it — so a root that is not a string is dropped before
  // it can take the whole lookup down.
  const roots = [process.resourcesPath, app.getAppPath(), join(__dirname, '..', '..')]
  return roots
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .map((r) => join(r, 'extension'))
}

export function extensionDir(): string {
  const found = candidates().find((dir) => existsSync(join(dir, 'manifest.json')))
  // The first candidate when none exist, so the Reveal button has somewhere to point and
  // `isExtensionAvailable` reports false rather than throwing.
  return found ?? candidates()[0] ?? 'extension'
}

/**
 * The id Chrome will give it, read from the folder rather than hardcoded twice.
 *
 * Pinned by `manifest.key`, so it is the same on every machine — which is what lets the
 * bridge check that a request's Origin is really this extension.
 */
export function extensionId(): string {
  try {
    return readFileSync(join(extensionDir(), 'EXTENSION_ID'), 'utf-8').trim()
  } catch {
    return ''
  }
}

/**
 * Loadable, not merely present.
 *
 * `manifest.json` points at `dist/background.js`, which `tsc` produces — so a tree where
 * the extension has never been built has a manifest and no worker, and Chrome rejects it
 * with an error that does not say why. Checking the built file means the app can say
 * "not in this build" instead of letting somebody find out in `chrome://extensions`.
 */
export const isExtensionAvailable = (): boolean =>
  existsSync(join(extensionDir(), 'manifest.json')) &&
  existsSync(join(extensionDir(), 'dist', 'background.js')) &&
  extensionId() !== ''

export const revealExtension = (): void => void shell.openPath(extensionDir())

/**
 * Approving a connection, asked at the moment it matters.
 *
 * The first design had a five-minute window somebody opened in the app before clicking in
 * Chrome — two steps in two applications to answer one question, and no way to tell what
 * the first one was for. This asks when the extension actually asks, which is the only
 * point at which a person has the context to say yes.
 *
 * Only snapit's own extension can get this far: the bridge checks the request's Origin
 * against the pinned id first. The guards below are about not being a nuisance rather
 * than about trust — one dialog at a time, and a refusal is remembered briefly so that
 * clicking record repeatedly does not reopen it.
 */
const DECLINE_QUIET_MS = 60_000

let asking: Promise<boolean> | null = null
let declinedUntil = 0
let paired = false

export const isExtensionPaired = (): boolean => paired

export function confirmExtensionPairing(parent: BrowserWindow | null): Promise<boolean> {
  if (paired) return Promise.resolve(true)
  if (Date.now() < declinedUntil) return Promise.resolve(false)
  // One dialog, however many times the extension retries while it is open.
  if (asking) return asking

  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Connect', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    message: 'Let the snapit extension connect?',
    detail:
      'The snapit extension in Chrome is asking to send captures to this app. It can only ' +
      'reach snapit on this machine, and only while you are recording a tab.'
  }

  asking = (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options))
    .then(({ response }) => {
      paired = response === 0
      if (!paired) declinedUntil = Date.now() + DECLINE_QUIET_MS
      return paired
    })
    .catch(() => false)
    .finally(() => {
      asking = null
    })

  return asking
}

/** Forget the approval — used when the token is regenerated. */
export const forgetPairing = (): void => {
  paired = false
  declinedUntil = 0
}
