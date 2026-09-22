import { createHmac, timingSafeEqual } from 'node:crypto'
import { isRole, type Role } from '../domain/rbac.ts'

/**
 * Bearer tokens, signed rather than stored.
 *
 * **This is a prototype stand-in and should not survive contact with a real deployment.**
 * A production snapit would put an OIDC provider here and hold no password, because the
 * customers who want their own bucket are the same customers who want their own SSO —
 * and because ROADMAP M1.7's first cost is "a stored credential", which is a cost you
 * decline by never being the identity provider.
 *
 * What it does get right, and what a replacement must keep:
 *
 * - The workspace and role are *inside* the signed payload, so a request cannot name a
 *   workspace it was not issued for. The API never reads a workspace id from the path
 *   without checking it against this.
 * - It is verified in constant time, and a payload whose signature does not verify is
 *   never parsed. The order matters: parsing first is how a forged `exp` gets read.
 * - It expires. A desktop app holding a non-expiring token is a credential on a laptop.
 *
 * Pure: no clock of its own, no store. `now` is passed in.
 */

export type TokenClaims = {
  /** User id. */
  sub: string
  /** Workspace id this token is scoped to. */
  ws: string
  org: string
  role: Role
  /** Unix seconds. */
  exp: number
}

const VERSION = 'v1'

const b64url = (value: Buffer | string): string =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromB64url = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const sign = (secret: string, body: string): string =>
  b64url(createHmac('sha256', secret).update(body).digest())

export function issueToken(secret: string, claims: TokenClaims): string {
  const body = `${VERSION}.${b64url(JSON.stringify(claims))}`
  return `${body}.${sign(secret, body)}`
}

export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; why: string }

export function verifyToken(secret: string, token: string, nowSeconds: number): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, why: 'Malformed token.' }
  const [version, encoded, provided] = parts as [string, string, string]

  const expected = Buffer.from(sign(secret, `${version}.${encoded}`))
  const actual = Buffer.from(provided)
  // Length first: timingSafeEqual throws on a mismatch, and a thrown error is a louder
  // oracle than the comparison it was meant to hide.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, why: 'Signature does not verify.' }
  }

  let claims: unknown
  try {
    claims = JSON.parse(fromB64url(encoded).toString('utf-8'))
  } catch {
    return { ok: false, why: 'Token payload is not JSON.' }
  }
  if (!isClaims(claims)) return { ok: false, why: 'Token payload is missing fields.' }
  if (claims.exp <= nowSeconds) return { ok: false, why: 'Token has expired.' }
  return { ok: true, claims }
}

function isClaims(raw: unknown): raw is TokenClaims {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.sub === 'string' &&
    typeof o.ws === 'string' &&
    typeof o.org === 'string' &&
    typeof o.exp === 'number' &&
    Number.isFinite(o.exp) &&
    isRole(o.role)
  )
}

/** The `Authorization: Bearer …` value, or null. Mirrors `src/main/mcp/auth.ts` in the app. */
export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  const match = /^Bearer (.+)$/.exec(value)
  return match?.[1] ?? null
}
