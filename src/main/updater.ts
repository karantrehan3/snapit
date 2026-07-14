import { app, net } from 'electron'
import { resolveUpdate, type UpdateInfo } from './updateResolve'

export type { UpdateInfo } from './updateResolve'

/**
 * Lightweight update check against the GitHub Releases API. This is the
 * notify-and-download approach (no in-place install), which needs no code
 * signing — the user downloads the new installer and applies it. True silent
 * auto-install (electron-updater / Squirrel) requires a stable Developer ID /
 * self-signed certificate, tracked separately.
 *
 * The decision logic lives in `updateResolve.ts` (pure, unit-tested); this only
 * does the fetch + supplies the running version and platform.
 */

const REPO = 'karantrehan3/snapit'

/** Resolve to the newer release, or null if up to date / on error. */
export function checkForUpdate(): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    const req = net.request(`https://api.github.com/repos/${REPO}/releases/latest`)
    req.setHeader('User-Agent', 'snapit-updater')
    req.setHeader('Accept', 'application/vnd.github+json')
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk.toString()))
      res.on('end', () => {
        try {
          resolve(resolveUpdate(JSON.parse(body), app.getVersion(), process.platform))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}
