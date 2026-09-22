import { describe, expect, test } from 'vitest'
import { extractBearerToken, issueToken, verifyToken, type TokenClaims } from '../tokens.ts'

const SECRET = 'a-secret-that-is-at-least-32-characters'
const NOW = 1_800_000_000

const claims: TokenClaims = {
  sub: 'usr-1',
  ws: 'ws-1',
  org: 'org-1',
  role: 'developer',
  exp: NOW + 3600
}

const unwrap = (token: string, now = NOW): TokenClaims => {
  const result = verifyToken(SECRET, token, now)
  if (!result.ok) throw new Error(result.why)
  return result.claims
}

describe('round trip', () => {
  test('returns exactly the claims that were issued', () => {
    expect(unwrap(issueToken(SECRET, claims))).toEqual(claims)
  })

  test('survives a role and ids with characters that need url-safe base64', () => {
    const odd = { ...claims, sub: 'usr-?+/=', ws: 'ws-ü' }
    expect(unwrap(issueToken(SECRET, odd))).toEqual(odd)
  })
})

describe('refusal', () => {
  test('refuses a token signed with a different secret', () => {
    const other = issueToken('another-secret-of-at-least-32-characters', claims)
    expect(verifyToken(SECRET, other, NOW)).toEqual({ ok: false, why: 'Signature does not verify.' })
  })

  test('refuses an edited payload, which is the whole point', () => {
    // A viewer promoting themselves to admin by rewriting the claim.
    const forged = issueToken(SECRET, claims).split('.')
    forged[1] = Buffer.from(JSON.stringify({ ...claims, role: 'admin' }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(verifyToken(SECRET, forged.join('.'), NOW).ok).toBe(false)
  })

  test('refuses an expired token, and at the exact second it expires', () => {
    const token = issueToken(SECRET, claims)
    expect(verifyToken(SECRET, token, claims.exp - 1).ok).toBe(true)
    expect(verifyToken(SECRET, token, claims.exp)).toEqual({ ok: false, why: 'Token has expired.' })
  })

  test('refuses a payload missing fields, rather than defaulting them', () => {
    // A token with no `ws` must not be readable as "any workspace".
    const { ws, ...rest } = claims
    const token = issueToken(SECRET, rest as TokenClaims)
    expect(verifyToken(SECRET, token, NOW)).toEqual({ ok: false, why: 'Token payload is missing fields.' })
  })

  test('refuses a role that is not one of the three', () => {
    const token = issueToken(SECRET, { ...claims, role: 'owner' as never })
    expect(verifyToken(SECRET, token, NOW).ok).toBe(false)
  })

  test.each(['', 'nonsense', 'v1.only-two', 'v2.abc.def', 'v1..sig'])('refuses %j', (token) => {
    expect(verifyToken(SECRET, token, NOW).ok).toBe(false)
  })
})

describe('extractBearerToken', () => {
  test('reads the header the desktop app sends', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(extractBearerToken(['Bearer abc'])).toBe('abc')
  })

  test.each([undefined, '', 'abc', 'bearer abc', 'Basic abc', 'Bearer'])('refuses %j', (header) => {
    expect(extractBearerToken(header)).toBeNull()
  })
})
