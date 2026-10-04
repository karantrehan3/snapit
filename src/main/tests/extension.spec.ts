import { afterEach, describe, expect, test, vi } from 'vitest'

/**
 * Finding the extension folder, which snapit got wrong in a way that produced the wrong
 * error message.
 *
 * `app.getAppPath()` follows whatever entry script Electron was given, so a single guess
 * is right in one launch mode and wrong in another. When it was wrong the id came back
 * empty and the bridge refused the real extension as "not the snapit extension" — a
 * confusing way to say "I could not find my own folder".
 */
const existsSync = vi.fn<(p: string) => boolean>(() => false)
const readFileSync = vi.fn(() => 'flhandipbjjgpogpdoemadcebhjlgneo\n')

vi.mock('fs', () => ({ existsSync, readFileSync }))
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app-path' },
  shell: { openPath: vi.fn() }
}))

// Electron sets this; nothing else does. The source must survive its absence, which is
// what the last case in 'finding the folder' covers.
;(process as { resourcesPath?: string }).resourcesPath = '/Electron.app/Contents/Resources'

const { extensionDir, extensionId, isExtensionAvailable, allowPairing, isPairingAllowed, closePairing } =
  await import('../extension')

afterEach(() => {
  vi.clearAllMocks()
  closePairing()
})

describe('finding the folder', () => {
  test('prefers the packaged location', () => {
    existsSync.mockImplementation((p) => p.includes('Resources'))
    expect(extensionDir()).toContain('Resources')
  })

  test('falls back to the app path when not packaged', () => {
    existsSync.mockImplementation((p) => p.startsWith('/app-path'))
    expect(extensionDir()).toBe('/app-path/extension')
  })

  test('falls back to the build output’s own neighbour when getAppPath points elsewhere', () => {
    // The case that bit: `electron out/main/index.js` makes getAppPath the script's own
    // directory, so only a path derived from __dirname finds the repository's folder.
    existsSync.mockImplementation((p) => !p.includes('Resources') && !p.startsWith('/app-path'))
    expect(extensionDir()).not.toBe('/app-path/extension')
    expect(extensionDir()).toContain('extension')
  })

  test('returns somewhere rather than throwing when nothing exists', () => {
    existsSync.mockReturnValue(false)
    expect(extensionDir()).toContain('extension')
    expect(isExtensionAvailable()).toBe(false)
  })
})

describe('availability', () => {
  test('needs the built worker, not just a manifest', () => {
    // A tree where the extension was never built has a manifest pointing at a file that
    // is not there, and Chrome rejects it without saying why.
    existsSync.mockImplementation((p) => p.endsWith('manifest.json'))
    expect(isExtensionAvailable()).toBe(false)

    existsSync.mockImplementation((p) => p.endsWith('manifest.json') || p.endsWith('background.js'))
    expect(isExtensionAvailable()).toBe(true)
  })

  test('is false when the id cannot be read', () => {
    existsSync.mockReturnValue(true)
    readFileSync.mockImplementationOnce(() => {
      throw new Error('gone')
    })
    expect(isExtensionAvailable()).toBe(false)
  })

  test('reads the pinned id, trimmed', () => {
    existsSync.mockReturnValue(true)
    expect(extensionId()).toBe('flhandipbjjgpogpdoemadcebhjlgneo')
  })
})

describe('the pairing window', () => {
  test('is shut until it is opened', () => {
    expect(isPairingAllowed()).toBe(false)
    allowPairing()
    expect(isPairingAllowed()).toBe(true)
  })

  test('shuts again, so a handshake does not leave it standing', () => {
    allowPairing()
    closePairing()
    expect(isPairingAllowed()).toBe(false)
  })

  test('expires on its own', () => {
    const until = allowPairing()
    vi.setSystemTime(new Date(until + 1))
    expect(isPairingAllowed()).toBe(false)
    vi.useRealTimers()
  })
})
