import { afterEach, describe, expect, test, vi } from 'vitest'

/**
 * One behaviour, and it is about a dialog rather than about data.
 *
 * `safeStorage.isEncryptionAvailable()` reaches into the macOS Keychain, which makes the
 * OS ask "snapit wants to use your confidential information stored in snapit Safe Storage".
 * snapit called it on every launch, before checking whether a session file existed — so
 * everyone got that prompt, for a sign-in feature that is not shipped. This pins the
 * order so it cannot come back.
 */
const isEncryptionAvailable = vi.fn(() => true)
const decryptString = vi.fn(() => '{}')
const encryptString = vi.fn(() => Buffer.from('x'))
const existsSync = vi.fn(() => false)

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/snapit-test' },
  safeStorage: { isEncryptionAvailable, decryptString, encryptString }
}))
vi.mock('fs', () => ({
  existsSync,
  readFileSync: vi.fn(() => Buffer.from('x')),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn()
}))

const { loadSession } = await import('../credentials')

afterEach(() => vi.clearAllMocks())

describe('loadSession', () => {
  test('never touches the keychain when there is no session file', () => {
    existsSync.mockReturnValue(false)
    expect(loadSession()).toBeNull()
    // The assertion that matters: no prompt for somebody who has never signed in.
    expect(isEncryptionAvailable).not.toHaveBeenCalled()
    expect(decryptString).not.toHaveBeenCalled()
  })

  test('uses the keychain only once a session exists', () => {
    existsSync.mockReturnValue(true)
    decryptString.mockReturnValue(
      JSON.stringify({ token: 't', serverUrl: 'https://x', expiresAt: '2099-01-01T00:00:00.000Z' })
    )
    expect(loadSession()).toMatchObject({ token: 't' })
    expect(isEncryptionAvailable).toHaveBeenCalled()
  })

  test('an expired session is dropped rather than started with', () => {
    existsSync.mockReturnValue(true)
    decryptString.mockReturnValue(
      JSON.stringify({ token: 't', serverUrl: 'https://x', expiresAt: '2000-01-01T00:00:00.000Z' })
    )
    expect(loadSession()).toBeNull()
  })

  test('an unreadable file is absent, not an error', () => {
    existsSync.mockReturnValue(true)
    decryptString.mockImplementation(() => {
      throw new Error('keychain changed')
    })
    expect(loadSession()).toBeNull()
  })
})
