import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app, shell } from 'electron'

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

export function extensionDir(): string {
  // Packaged: Contents/Resources/extension. Development: the workspace folder.
  const packaged = join(process.resourcesPath, 'extension')
  return existsSync(packaged) ? packaged : join(app.getAppPath(), 'extension')
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

export const isExtensionAvailable = (): boolean =>
  existsSync(join(extensionDir(), 'manifest.json')) && extensionId() !== ''

export const revealExtension = (): void => void shell.openPath(extensionDir())

let pairingUntil = 0

/**
 * Open a window in which the extension may collect a token.
 *
 * Time-boxed rather than a standing permission: pairing happens once, and a port that
 * hands out a token forever is one that hands it to whatever asks next. The origin check
 * narrows who can ask; this narrows when.
 */
export const allowPairing = (): number => (pairingUntil = Date.now() + PAIRING_WINDOW_MS)

export const isPairingAllowed = (): boolean => Date.now() < pairingUntil

export const closePairing = (): void => {
  pairingUntil = 0
}
