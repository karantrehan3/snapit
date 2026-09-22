import { readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/**
 * Where the desktop app keeps its captures, read from the app's own settings.
 *
 * Purely a convenience for the local development tools in `scripts/`: the alternative is
 * asking somebody to type a path they have never had to know, on the way to trying
 * something for the first time. The server itself never calls this — it has no business
 * knowing that a desktop app exists on the same machine, and in any real deployment it
 * does not.
 *
 * Mirrors electron's `app.getPath('userData')`, which is the only reason these three
 * paths are hardcoded.
 */

function userDataDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'snapit')
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'snapit')
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'snapit')
  }
}

/** The app's configured save folder, or the default it would have used, or null. */
export function findSaveDir(): string | null {
  try {
    const settings = JSON.parse(readFileSync(join(userDataDir(), 'settings.json'), 'utf-8')) as {
      saveDir?: unknown
    }
    if (typeof settings.saveDir === 'string' && settings.saveDir) return settings.saveDir
  } catch {
    // The app may never have run here, which is not an error — fall back to its default.
  }
  return platform() === 'darwin' ? join(homedir(), 'Pictures', 'snapit') : null
}
