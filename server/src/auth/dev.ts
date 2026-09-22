import type { AuthRequest, AuthenticatedUser, IdentityProvider } from '@snapit/core/auth/provider'

/**
 * Sign in as anybody, by typing their email.
 *
 * Exactly what it looks like, and it exists so the rest of the stack — the token, the
 * membership lookup, the remote capture store — can be exercised without standing up an
 * IdP. It authenticates nothing.
 *
 * Two guards, because a provider like this reaching a real deployment is the worst
 * possible outcome:
 *
 *   1. It is only constructed when `SNAPIT_AUTH_PROVIDER=dev`, which is not the default.
 *   2. `config.ts` refuses that value unless the storage provider is `local`. A server
 *      pointed at a real bucket cannot be started with this, whatever is in its env.
 *
 * It also logs, loudly, on every use. A dev provider that is quiet is one somebody forgets
 * is there.
 */
export function createDevIdentityProvider(): IdentityProvider {
  return {
    id: 'dev',

    describe: () => ({
      kind: 'email',
      detail: 'Development sign-in: any email that is a member of this workspace, no password.'
    }),

    async authenticate(request: AuthRequest): Promise<AuthenticatedUser> {
      const email = request.credential.trim().toLowerCase()
      if (!email.includes('@')) throw new Error('Sign in with the email address you were invited as.')
      console.warn(`[snapit-server] DEV SIGN-IN as ${email} — nothing was authenticated.`)
      return { email }
    }
  }
}
