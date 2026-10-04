import { extractBearerToken, tokensMatch } from '../mcp/auth'

/**
 * Who may talk to the collector bridge.
 *
 * The bridge is a loopback HTTP server that accepts a browser extension's recording of
 * somebody's authenticated session, so the question "who is asking" matters more here than
 * anywhere else in the app. Three checks, in the order they can be defeated:
 *
 * 1. **Origin must be our extension.** Chrome sets `Origin: chrome-extension://<id>` and a
 *    web page cannot forge it, so this rules out every page on the internet reaching a port
 *    on localhost. It does *not* rule out another extension that copied our public key out
 *    of the manifest — the key is public, so the id is claimable. That is what the consent
 *    prompt is for, and why pairing is a one-time decision a person makes rather than a
 *    check this file can do alone.
 * 2. **Bearer token** on everything after pairing, compared in constant time.
 * 3. **Pairing is explicit.** `/collector/pair` hands out the token, and only when the app
 *    has been told to allow it.
 *
 * Pure, so the rules are testable without a socket. Mirrors `mcp/auth.ts`, which guards the
 * same class of thing for agents.
 */

/** Built from `manifest.key`; see `extension/EXTENSION_ID`. */
export const extensionOrigin = (id: string): string => `chrome-extension://${id}`

/**
 * Whether a request came from our extension.
 *
 * A missing Origin fails. Every `fetch` from an extension service worker carries one, so an
 * absent header means something that is not the extension — most likely a curl or a local
 * script, neither of which should be handing us a session.
 */
export function isOurExtension(origin: string | string[] | undefined, extensionId: string): boolean {
  const value = Array.isArray(origin) ? origin[0] : origin
  if (!value || !extensionId) return false
  return value === extensionOrigin(extensionId)
}

export type AuthOutcome = { ok: true } | { ok: false; status: number; why: string }

const DENIED: AuthOutcome = { ok: false, status: 403, why: 'Not the snapit extension.' }

/** Pairing: origin only, since the token is what this call is for. */
export function checkPairRequest(
  origin: string | string[] | undefined,
  extensionId: string,
  allowed: boolean
): AuthOutcome {
  if (!isOurExtension(origin, extensionId)) return DENIED
  // Refused rather than prompted from here: a request must not be able to raise a dialog,
  // or a page that cannot read the answer can still make the machine beep all day.
  if (!allowed)
    return { ok: false, status: 403, why: 'Pairing is not enabled. Enable it in snapit, then retry.' }
  return { ok: true }
}

/** Everything else: origin and token. */
export function checkCollectorRequest(
  origin: string | string[] | undefined,
  authorization: string | string[] | undefined,
  extensionId: string,
  expectedToken: string
): AuthOutcome {
  if (!isOurExtension(origin, extensionId)) return DENIED
  const provided = extractBearerToken(authorization)
  if (!provided) return { ok: false, status: 401, why: 'Missing bearer token.' }
  if (!expectedToken || !tokensMatch(provided, expectedToken)) {
    return { ok: false, status: 401, why: 'Pair again — that token is not current.' }
  }
  return { ok: true }
}

/**
 * Whether the extension and the app agree about the protocol between them.
 *
 * An unpacked extension does not auto-update, so updating snapit leaves the old one
 * loaded — and the mismatch shows up as a session that is subtly short rather than as an
 * error. Only the major version is compared: the two travel together, and anything that
 * changes what is on the wire is a major bump.
 */
export function versionsAgree(extensionVersion: string, appExpects: string): boolean {
  const major = (v: string): string => (v.split('.')[0] ?? '').trim()
  return major(extensionVersion) === major(appExpects) && major(appExpects) !== ''
}
