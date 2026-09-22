import type { IdentityProvider } from '@snapit/core/auth/provider'

/**
 * OIDC — shaped, not built.
 *
 * This is the provider a real deployment uses, and writing down what it costs is more
 * useful right now than a half-implementation nobody can test without an IdP.
 *
 * **The flow for a desktop app is the device authorization grant** (RFC 8628), not the
 * authorization code flow. The difference matters: an Electron app has no trustworthy
 * redirect URI, and embedding a browser window to collect somebody's corporate password is
 * the exact pattern IdPs are moving to block. Device flow puts the login in the user's own
 * browser, where their password manager and their MFA already work:
 *
 *   1. App asks the server to start a sign-in. Server calls the IdP's device endpoint and
 *      returns a short user code and a verification URL.
 *   2. The person opens that URL in their own browser and approves.
 *   3. App polls the server until the IdP issues tokens, honouring `interval` and
 *      `slow_down`, which is the part naive implementations get wrong and get rate-limited
 *      for.
 *
 * What building it needs, in the order it bites:
 *
 * - **Discovery** — fetch `/.well-known/openid-configuration` once and cache it, rather
 *   than asking a customer to configure five endpoints by hand and mistype one.
 * - **JWKS and verification** — fetch the signing keys, verify `iss`, `aud`, `exp` and the
 *   signature. `node:crypto` can do RS256 verification; the fiddly part is key rotation, so
 *   cache by `kid` and refetch on an unknown one.
 * - **Nothing beyond the email.** Resist mapping IdP groups to snapit roles — that is a
 *   second permission model synchronised by hand, and `IdentityProvider`'s contract says
 *   membership decides. Revisit only when a customer with hundreds of users asks.
 *
 * Until then a deployment runs `SNAPIT_AUTH_PROVIDER=dev` against local storage, which is
 * the development configuration and is refused against a real bucket.
 */
export type OidcConfig = { issuer: string; clientId: string; clientSecret?: string }

export function createOidcIdentityProvider(_config: OidcConfig): IdentityProvider {
  const refuse = (): never => {
    throw new Error(
      'The OIDC identity provider is not implemented in this prototype. It needs the device ' +
        'authorization grant, discovery and JWKS verification — see src/auth/oidc.ts.'
    )
  }
  return {
    id: 'oidc',
    describe: () => refuse(),
    authenticate: async () => refuse()
  }
}
