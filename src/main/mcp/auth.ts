import { timingSafeEqual } from 'crypto'

const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  const match = /^Bearer (.+)$/.exec(value)
  return match ? match[1] : null
}

export function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Rejects Host headers that don't target this loopback port (DNS-rebinding guard). */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false
  return LOCAL_HOSTS.some((h) => host === `${h}:${port}`)
}

/** No Origin header (every real MCP HTTP client) passes; a browser-page Origin must be loopback. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (!origin) return true
  return LOCAL_HOSTS.some((h) => origin === `http://${h}:${port}`)
}
