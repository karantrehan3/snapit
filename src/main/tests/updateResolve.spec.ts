import { describe, it, expect } from 'vitest'
import { isNewer, installerFor, resolveUpdate, type GithubRelease } from '../updateResolve'

// Mirrors the real v2.0.0 GitHub release payload (tag + the three installers).
const release: GithubRelease = {
  tag_name: 'v2.0.0',
  html_url: 'https://github.com/karantrehan3/snapit/releases/tag/v2.0.0',
  assets: [
    {
      name: 'snapit-2.0.0-linux-x64.AppImage',
      browser_download_url: 'https://dl/snapit-2.0.0-linux-x64.AppImage'
    },
    { name: 'snapit-2.0.0-mac-arm64.dmg', browser_download_url: 'https://dl/snapit-2.0.0-mac-arm64.dmg' },
    {
      name: 'snapit-2.0.0-win-x64-setup.exe',
      browser_download_url: 'https://dl/snapit-2.0.0-win-x64-setup.exe'
    }
  ]
}

describe('isNewer', () => {
  it('compares major.minor.patch numerically', () => {
    expect(isNewer('2.0.1', '2.0.0')).toBe(true)
    expect(isNewer('2.1.0', '2.0.9')).toBe(true)
    expect(isNewer('3.0.0', '2.9.9')).toBe(true)
    expect(isNewer('2.0.0', '2.0.0')).toBe(false)
    expect(isNewer('1.9.0', '2.0.0')).toBe(false)
    expect(isNewer('2.0.10', '2.0.9')).toBe(true) // not string comparison
  })

  it('tolerates a leading v and missing parts', () => {
    expect(isNewer('v2.0.1', 'v2.0.0')).toBe(true)
    expect(isNewer('2.1', '2.0.5')).toBe(true)
    expect(isNewer('2', '1.9.9')).toBe(true)
  })
})

describe('installerFor', () => {
  it('picks the right asset per platform (case-insensitive extension)', () => {
    expect(installerFor(release.assets!, 'darwin')).toContain('mac-arm64.dmg')
    expect(installerFor(release.assets!, 'win32')).toContain('win-x64-setup.exe')
    expect(installerFor(release.assets!, 'linux')).toContain('linux-x64.AppImage')
  })

  it('returns null when nothing matches', () => {
    expect(installerFor([], 'darwin')).toBeNull()
    expect(
      installerFor([{ name: 'notes.txt', browser_download_url: 'https://dl/notes.txt' }], 'darwin')
    ).toBeNull()
  })
})

describe('resolveUpdate', () => {
  it('returns null when already on the latest version', () => {
    expect(resolveUpdate(release, '2.0.0', 'darwin')).toBeNull()
  })

  it('returns null when running ahead of the latest release (dev build)', () => {
    expect(resolveUpdate(release, '2.0.1', 'darwin')).toBeNull()
  })

  it('returns version + platform installer when behind', () => {
    const r = resolveUpdate(release, '1.9.0', 'darwin')
    expect(r).not.toBeNull()
    expect(r!.version).toBe('2.0.0')
    expect(r!.downloadUrl).toContain('mac-arm64.dmg')
    expect(r!.notesUrl).toBe(release.html_url)
  })

  it('gives each platform its own installer', () => {
    expect(resolveUpdate(release, '1.0.0', 'win32')!.downloadUrl).toContain('win-x64-setup.exe')
    expect(resolveUpdate(release, '1.0.0', 'linux')!.downloadUrl).toContain('linux-x64.AppImage')
  })

  it('falls back to the release page when no matching installer', () => {
    const r = resolveUpdate({ ...release, assets: [] }, '1.0.0', 'darwin')
    expect(r!.downloadUrl).toBe(release.html_url)
  })

  it('returns null for a malformed release (no tag)', () => {
    expect(resolveUpdate({}, '1.0.0', 'darwin')).toBeNull()
    expect(resolveUpdate({ tag_name: '' }, '1.0.0', 'darwin')).toBeNull()
  })
})
