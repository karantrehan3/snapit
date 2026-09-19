import { createHash, createHmac, randomUUID } from 'node:crypto'

/**
 * AWS Signature Version 4, query-string flavour.
 *
 * Written out rather than pulled from `@aws-sdk/*` for two reasons that both matter more
 * than the ~120 lines. First, the app it sits next to ships an Electron binary and
 * guards its dependency tree closely; a prototype that adds a 3 MB transitive tree to
 * the repo is a prototype nobody will merge. Second, and more usefully: presigning is
 * the *only* S3 operation this server needs. Query-string auth signs no headers beyond
 * `host`, so the same function serves the desktop's direct upload, the viewer's media
 * URL, and the server's own reads — see the note in `s3.ts` about why the server calls
 * itself through a presigned URL instead of signing request headers.
 *
 * Pure: config and a request description in, a URL out. No clock of its own, no socket,
 * so the AWS test vectors can be replayed against it exactly.
 */

export type SigV4Credentials = {
  accessKeyId: string
  secretAccessKey: string
  /** Set for STS / IRSA credentials; becomes `X-Amz-Security-Token`. */
  sessionToken?: string
}

/** Every byte except the RFC 3986 unreserved set. AWS is stricter than `encodeURIComponent`. */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = ''
  for (const byte of Buffer.from(value, 'utf-8')) {
    const char = String.fromCharCode(byte)
    if (/[A-Za-z0-9\-_.~]/.test(char)) out += char
    else if (char === '/' && !encodeSlash) out += char
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf-8').digest('hex')

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value, 'utf-8').digest()

/** `20260919T140211Z` and `20260919`. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request')
}

/** Sorted by name, then by value — AWS compares the encoded forms, not the raw ones. */
export function canonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([name, value]) => [uriEncode(name), uriEncode(value)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
}

export type PresignInput = {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE'
  /** Host only, no scheme, with a port if there is one. */
  host: string
  /** Absolute, already split into segments; each is encoded here. */
  path: string
  /** Query parameters other than the `X-Amz-*` set. */
  query?: Record<string, string>
  region: string
  service?: string
  credentials: SigV4Credentials
  expiresInSeconds: number
  now: Date
  protocol?: 'http:' | 'https:'
}

/**
 * The `X-Amz-*` parameters that go into the signature and then into the URL.
 *
 * `UNSIGNED-PAYLOAD` is correct and necessary for a presigned `PUT`: it is signed before
 * the body exists, so the body cannot be in the signature. The consequence worth knowing
 * is that the signature authorises writing *anything* to that key until it expires,
 * which is why `s3.ts` caps every window it mints.
 */
export function presignParams(input: PresignInput): Record<string, string> {
  const { amzDate, dateStamp } = amzDates(input.now)
  const service = input.service ?? 's3'
  return {
    ...input.query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.credentials.accessKeyId}/${dateStamp}/${input.region}/${service}/aws4_request`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
    ...(input.credentials.sessionToken ? { 'X-Amz-Security-Token': input.credentials.sessionToken } : {})
  }
}

/** Step 1 of SigV4. Split out because it is the step with AWS-published test vectors. */
export function canonicalRequest(input: PresignInput): string {
  return [
    input.method,
    uriEncode(input.path, false),
    canonicalQuery(presignParams(input)),
    `host:${input.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')
}

/** Step 2 of SigV4. */
export function stringToSign(input: PresignInput): string {
  const { amzDate, dateStamp } = amzDates(input.now)
  return [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${input.region}/${input.service ?? 's3'}/aws4_request`,
    sha256Hex(canonicalRequest(input))
  ].join('\n')
}

/** Step 3 of SigV4. */
export function signature(input: PresignInput): string {
  const { dateStamp } = amzDates(input.now)
  const key = signingKey(input.credentials.secretAccessKey, dateStamp, input.region, input.service ?? 's3')
  return hmac(key, stringToSign(input)).toString('hex')
}

/**
 * The presigned URL, and nothing else — no headers to remember, which is what makes this
 * safe to hand to a `<video src>` or to an unmodified `fetch`.
 */
export function presign(input: PresignInput): string {
  const query = canonicalQuery(presignParams(input))
  const protocol = input.protocol ?? 'https:'
  return `${protocol}//${input.host}${uriEncode(input.path, false)}?${query}&X-Amz-Signature=${signature(input)}`
}

/** A probe key that cannot collide with a concurrent preflight. */
export const probeName = (): string => `${randomUUID()}.txt`
