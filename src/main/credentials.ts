import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'

/**
 * Where a session token lives.
 *
 * Not `settings.json`. That file is world-readable, is written by `setSettings` from the
 * renderer's requests, and gets pasted into bug reports — it is the right home for a
 * hotkey and the wrong one for a credential that can read a workspace's captures.
 *
 * `safeStorage` encrypts against the OS keychain (Keychain on macOS, DPAPI on Windows,
 * libsecret on Linux), so the ciphertext on disk is useless to anything that is not this
 * app on this machine and this login.
 *
 * **It can be unavailable**, and that is the case worth handling rather than asserting
 * away: a Linux box with no keyring, or a session where the keychain is locked. When it
 * is, snapit stores nothing at all and the person signs in again next launch. Writing a
 * plaintext fallback would defeat the point of asking for the keychain in the first place,
 * and this is a tool whose worst day is being slightly annoying, not leaking a token.
 */

const FILE = 'session.bin'

const path = (): string => join(app.getPath('userData'), FILE)

export type StoredSession = {
  token: string
  expiresAt: string
  serverUrl: string
  userId: string
  email: string
  workspaceId: string
  workspaceName: string
  role: string
}

export const canPersistSession = (): boolean => {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function saveSession(session: StoredSession): void {
  if (!canPersistSession()) {
    console.warn('[snapit] no OS keychain available; staying signed in only until quit.')
    return
  }
  try {
    writeFileSync(path(), safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 })
  } catch (err) {
    console.error('[snapit] could not save the session:', err)
  }
}

/** The stored session, or null — expired, unreadable and absent are all the same answer. */
export function loadSession(now: Date = new Date()): StoredSession | null {
  if (!canPersistSession() || !existsSync(path())) return null
  try {
    const session = JSON.parse(safeStorage.decryptString(readFileSync(path()))) as StoredSession
    if (!session?.token || !session.serverUrl) return null
    // An expired token would be rejected by the server anyway; dropping it here means the
    // app starts local rather than starting connected and failing its first call.
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      clearSession()
      return null
    }
    return session
  } catch {
    // A keychain that changed, a file from another install, or a truncated write. None of
    // it is recoverable and none of it is worth an error dialog — sign in again.
    return null
  }
}

export function clearSession(): void {
  try {
    if (existsSync(path())) unlinkSync(path())
  } catch (err) {
    console.error('[snapit] could not clear the session:', err)
  }
}
