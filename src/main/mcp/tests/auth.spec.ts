import { describe, it, expect } from 'vitest'
import { extractBearerToken, tokensMatch, isAllowedHost, isAllowedOrigin } from '../auth'

describe('extractBearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
  })

  it('returns null for missing, empty, or malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
    expect(extractBearerToken('Basic abc123')).toBeNull()
    expect(extractBearerToken('Bearer')).toBeNull()
  })

  it('uses the first value when Node hands back an array', () => {
    expect(extractBearerToken(['Bearer first', 'Bearer second'])).toBe('first')
  })

  it('returns null for an empty array', () => {
    expect(extractBearerToken([])).toBeNull()
  })
})

describe('tokensMatch', () => {
  it('matches identical tokens', () => {
    expect(tokensMatch('secret-token', 'secret-token')).toBe(true)
  })

  it('rejects a different token of the same length', () => {
    expect(tokensMatch('secret-token', 'secret-tokeX')).toBe(false)
  })

  it('rejects tokens of different lengths without throwing', () => {
    expect(tokensMatch('short', 'a-much-longer-token')).toBe(false)
  })

  it('rejects an empty provided token against a real one', () => {
    expect(tokensMatch('', 'secret-token')).toBe(false)
  })
})

describe('isAllowedHost', () => {
  it('accepts 127.0.0.1 and localhost on the configured port', () => {
    expect(isAllowedHost('127.0.0.1:47317', 47317)).toBe(true)
    expect(isAllowedHost('localhost:47317', 47317)).toBe(true)
  })

  it('rejects a mismatched port, a foreign host, or a missing header', () => {
    expect(isAllowedHost('127.0.0.1:9999', 47317)).toBe(false)
    expect(isAllowedHost('evil.example.com:47317', 47317)).toBe(false)
    expect(isAllowedHost(undefined, 47317)).toBe(false)
  })
})

describe('isAllowedOrigin', () => {
  it('passes through when there is no Origin header (every real MCP client)', () => {
    expect(isAllowedOrigin(undefined, 47317)).toBe(true)
  })

  it('accepts a loopback Origin on the configured port', () => {
    expect(isAllowedOrigin('http://127.0.0.1:47317', 47317)).toBe(true)
    expect(isAllowedOrigin('http://localhost:47317', 47317)).toBe(true)
  })

  it('rejects a browser-page Origin (DNS rebinding / cross-site attempt)', () => {
    expect(isAllowedOrigin('https://evil.example.com', 47317)).toBe(false)
    expect(isAllowedOrigin('http://127.0.0.1:9999', 47317)).toBe(false)
  })
})
