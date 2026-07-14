/**
 * Pure update-resolution logic (no Electron/network), so it's unit-testable.
 * `updater.ts` handles the I/O (GitHub fetch, app version, platform) and delegates
 * the decision to `resolveUpdate` here.
 */

export type ReleaseAsset = { name: string; browser_download_url: string }
export type GithubRelease = { tag_name?: string; html_url?: string; assets?: ReleaseAsset[] }

export type UpdateInfo = {
  /** Latest version without the leading "v", e.g. "2.1.0". */
  version: string
  /** Release page (notes). */
  notesUrl: string
  /** Direct installer for the platform, or the release page if none matched. */
  downloadUrl: string
}

const REPO_RELEASES = 'https://github.com/karantrehan3/snapit/releases'

const partsOf = (v: string): number[] =>
  v
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)

/** Numeric major.minor.patch comparison — true when `a` is newer than `b`. */
export function isNewer(a: string, b: string): boolean {
  const pa = partsOf(a)
  const pb = partsOf(b)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/** The installer asset URL matching the given platform, or null if none. */
export function installerFor(assets: ReleaseAsset[], platform: NodeJS.Platform): string | null {
  const ext = platform === 'darwin' ? '.dmg' : platform === 'win32' ? '.exe' : '.appimage'
  return assets.find((a) => a.name.toLowerCase().endsWith(ext))?.browser_download_url ?? null
}

/** Decide whether `release` is a newer version than `currentVersion` for `platform`. */
export function resolveUpdate(
  release: GithubRelease,
  currentVersion: string,
  platform: NodeJS.Platform
): UpdateInfo | null {
  const latest = (release.tag_name ?? '').replace(/^v/, '')
  if (!latest || !isNewer(latest, currentVersion)) return null
  const notesUrl = release.html_url ?? REPO_RELEASES
  return {
    version: latest,
    notesUrl,
    downloadUrl: installerFor(release.assets ?? [], platform) ?? notesUrl
  }
}
