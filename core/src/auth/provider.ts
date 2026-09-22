import type { Role } from '../domain/rbac.ts'

/**
 * Who a person is, according to something that is not snapit.
 *
 * The seam that keeps snapit out of the identity business. `ROADMAP.md` M1.7's first cost
 * is "a stored credential", and the way to decline it is to never hold one: a customer who
 * wants their own bucket and their own server already has SSO, and their IdP should be the
 * thing that says who is signing in.
 *
 * So authentication has exactly two steps and this interface is the first:
 *
 *   1. **Who is this?** — a provider proves an identity and returns a claimed email.
 *   2. **What may they do here?** — the workspace's membership decides, not the provider.
 *
 * Step 2 stays in snapit deliberately. An IdP knows who somebody is; it does not know that
 * they are an admin of the Web QA workspace, and a provider that could assert a role would
 * be a provider that could grant itself one.
 */

export type AuthenticatedUser = {
  /** Verified by the provider. Matched against workspace membership by email. */
  email: string
  /** Display name, when the provider offers one. */
  name?: string
  /** The provider's own subject id, kept for audit. */
  externalId?: string
}

export type AuthRequest = {
  /** Whatever the provider needs: an OIDC code, a device code, an email in dev. */
  credential: string
  /** PKCE verifier, or anything else a flow carries alongside the credential. */
  verifier?: string
}

export interface IdentityProvider {
  readonly id: 'dev' | 'oidc'
  /** Shown to a client so it knows how to collect a credential. */
  describe(): { kind: string; detail: string }
  /** Resolves to the user, or throws. Never returns null — a failure has a reason. */
  authenticate(request: AuthRequest): Promise<AuthenticatedUser>
}

/** What a successful sign-in gives a client. */
export type SignedIn = {
  token: string
  expiresAt: string
  user: { id: string; email: string; name: string }
  workspace: { id: string; name: string; slug: string }
  role: Role
}
