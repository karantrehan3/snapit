import { createLocalCaptureStore } from './localCaptures'
import { createRemoteCaptureStore, type RemoteSession } from './remoteCaptures'
import { clearSession, loadSession, saveSession, type StoredSession } from './credentials'
import { localIdentity, remoteIdentity, type Identity } from './identity'
import type { CaptureStore } from './captureStore'
import type { Role } from '@snapit/core/domain/rbac'

/**
 * Which store and which identity the app is running with.
 *
 * One rule governs everything here: **a server problem must never cost you your own
 * captures.** snapit is local-first, and a signed-in user whose server is down, whose
 * laptop is on a train, or whose token expired overnight has a save folder full of work
 * that is fine. So connecting is something the app *attempts* and falls back from, never
 * something it depends on to start.
 *
 * The consequence to keep in mind when reading the rest: `current()` can change from
 * connected to local at runtime, and every caller goes through it rather than holding a
 * store of its own.
 */

export type SessionState = {
  store: CaptureStore
  identity: Identity
  /** Null when local. */
  session: StoredSession | null
  /** Set when a sign-in was restored but the server could not be reached. */
  offlineReason: string | null
}

export type SignInResult = {
  token: string
  expiresAt: string
  user: { id: string; email: string; name: string }
  workspace: { id: string; name: string; slug: string }
  role: Role
}

const asRemote = (s: StoredSession): RemoteSession => ({
  serverUrl: s.serverUrl,
  token: s.token,
  workspaceId: s.workspaceId
})

export function createSessionManager(saveDir: () => string, ownerId: () => string) {
  const local = (offlineReason: string | null = null): SessionState => ({
    store: createLocalCaptureStore(saveDir),
    identity: localIdentity(ownerId()),
    session: null,
    offlineReason
  })

  let state: SessionState = local()

  const connect = (stored: StoredSession): SessionState => ({
    store: createRemoteCaptureStore(() => asRemote(stored)),
    identity: remoteIdentity(stored.userId, stored.role as Role),
    session: stored,
    offlineReason: null
  })

  return {
    current: (): SessionState => state,

    /**
     * Restore a stored sign-in at startup, if there is one and the server answers.
     *
     * The reachability check is the point. Without it the library's first read is a failed
     * fetch and an empty grid, which looks exactly like "all my captures are gone".
     */
    async restore(): Promise<SessionState> {
      const stored = loadSession()
      if (!stored) return (state = local())
      try {
        const res = await fetch(`${stored.serverUrl}/health`, {
          signal: AbortSignal.timeout(4000)
        })
        if (!res.ok) throw new Error(`health check returned ${res.status}`)
        return (state = connect(stored))
      } catch (err) {
        // The session is kept, not cleared: the server being down is not a sign-out, and
        // clearing would make a flaky network cost somebody their sign-in.
        const why = err instanceof Error ? err.message : String(err)
        console.warn(`[snapit] ${stored.serverUrl} is not answering (${why}); staying local.`)
        return (state = local(`Could not reach ${stored.serverUrl}. Showing local captures.`))
      }
    },

    /** Exchange a credential for a session. Throws with the server's own message. */
    async signIn(serverUrl: string, credential: string): Promise<SessionState> {
      const base = serverUrl.replace(/\/$/, '')
      const res = await fetch(`${base}/v1/auth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential }),
        signal: AbortSignal.timeout(15_000)
      })
      const envelope = (await res.json().catch(() => null)) as
        | { ok: true; data: SignInResult }
        | { ok: false; error: { message: string } }
        | null
      if (!envelope) throw new Error(`${base} did not answer with JSON.`)
      if (!envelope.ok) throw new Error(envelope.error.message)

      const stored: StoredSession = {
        token: envelope.data.token,
        expiresAt: envelope.data.expiresAt,
        serverUrl: base,
        userId: envelope.data.user.id,
        email: envelope.data.user.email,
        workspaceId: envelope.data.workspace.id,
        workspaceName: envelope.data.workspace.name,
        role: envelope.data.role
      }
      saveSession(stored)
      return (state = connect(stored))
    },

    signOut(): SessionState {
      clearSession()
      return (state = local())
    }
  }
}

export type SessionManager = ReturnType<typeof createSessionManager>
