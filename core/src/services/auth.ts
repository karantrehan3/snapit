import { issueToken } from '../auth/tokens.ts'
import { forbidden, unauthorized } from '../errors.ts'
import type { AuthRequest, IdentityProvider, SignedIn } from '../auth/provider.ts'
import type { MetadataStore } from '../store/metadata.ts'

/**
 * Signing in: the provider says who, the workspace says what.
 *
 * The split is the whole design. An IdP proves an email; it does not know that the email
 * is an admin of the Web QA workspace, and a provider that could assert a role would be a
 * provider that could grant itself one. So this asks the provider for an identity and then
 * asks the store for a membership, and a person the IdP authenticates perfectly well is
 * still refused if nobody has invited them.
 *
 * That order also means offboarding works the way an operator expects: remove the
 * membership and the next sign-in fails, without touching the IdP.
 */

/** Eight hours: a working day, after which a laptop left on a train stops being useful. */
const SESSION_SECONDS = 8 * 60 * 60

export type AuthDeps = {
  store: MetadataStore
  provider: IdentityProvider
  tokenSecret: string
}

export async function signIn(deps: AuthDeps, request: AuthRequest): Promise<SignedIn> {
  let authenticated
  try {
    authenticated = await deps.provider.authenticate(request)
  } catch (err) {
    // The provider's message is the useful one — "that code expired", "unknown user" — and
    // none of it reveals anything the person signing in does not already know.
    throw unauthorized(err instanceof Error ? err.message : 'Could not sign you in.')
  }

  const user = await deps.store.findUserByEmail(authenticated.email)
  // Deliberately the same refusal whether the user is unknown or merely not a member:
  // a different message would turn sign-in into a directory of who has an account.
  const denied = forbidden('That account is not a member of any workspace on this server.')
  if (!user) throw denied

  const workspaces = await deps.store.listWorkspacesForUser(user.id)
  const workspace = workspaces[0]
  if (!workspace) throw denied

  const membership = await deps.store.getMembership(workspace.id, user.id)
  if (!membership) throw denied

  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000)
  return {
    token: issueToken(deps.tokenSecret, {
      sub: user.id,
      ws: workspace.id,
      org: workspace.orgId,
      role: membership.role,
      exp: Math.floor(expiresAt.getTime() / 1000)
    }),
    expiresAt: expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    role: membership.role
  }
}

/** What a client needs to know before it can collect a credential. */
export const describeSignIn = (deps: AuthDeps): { provider: string; kind: string; detail: string } => {
  const described = deps.provider.describe()
  return { provider: deps.provider.id, ...described }
}
