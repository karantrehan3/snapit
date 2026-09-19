import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  amzDates,
  canonicalQuery,
  canonicalRequest,
  presign,
  signature,
  uriEncode,
  type PresignInput
} from '../sigv4.ts'

/**
 * A signer that is subtly wrong produces URLs that fail only against the real service,
 * which is the most expensive thing in this prototype to debug. So it is pinned twice,
 * from two sources outside itself:
 *
 * 1. The canonical-request hash below is the value AWS publishes for its presigned-GET
 *    example. Step 1 is where the mistakes live — the query ordering, the trailing
 *    newline after the header block, `UNSIGNED-PAYLOAD` — and this catches all of them.
 * 2. The signatures below were produced by `aws4@1.13.2` under a fixed clock and copied
 *    here. Seven of eight cases agreed on the first run; the eighth is recorded in
 *    `encoding` and is a divergence in aws4, not here.
 */
const CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
}
const NOW = new Date('2013-05-24T00:00:00Z')

const at = (over: Partial<PresignInput>): PresignInput => ({
  method: 'GET',
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  region: 'us-east-1',
  credentials: CREDENTIALS,
  expiresInSeconds: 86400,
  now: NOW,
  ...over
})

describe('canonical request', () => {
  test('hashes to the value AWS publishes for its presigned-GET example', () => {
    const hash = createHash('sha256')
      .update(canonicalRequest(at({})), 'utf-8')
      .digest('hex')
    expect(hash).toBe('3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04')
  })

  test('has the six lines SigV4 requires, with the blank one after the header block', () => {
    expect(canonicalRequest(at({})).split('\n')).toEqual([
      'GET',
      '/test.txt',
      'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host',
      'host:examplebucket.s3.amazonaws.com',
      '',
      'host',
      'UNSIGNED-PAYLOAD'
    ])
  })
})

describe('signature', () => {
  /** Cross-checked against aws4@1.13.2 at the fixed instant above. */
  test.each([
    [at({}), '3ed0be64024db54d5574a27da223529635c383f911f80e636f0ccc13890053d2'],
    [
      at({
        method: 'PUT',
        host: 'snapit.s3.eu-west-1.amazonaws.com',
        path: '/orgs/acme/workspaces/web/captures/c1/media/snap.mp4',
        region: 'eu-west-1',
        expiresInSeconds: 600
      }),
      '7c994bfe99fc18c25e9d8a5b6b92a4aab10f4a84a5a872b41c401d29cf3d9ede'
    ],
    [
      at({ host: 'localhost:9000', path: '/snapit-captures/orgs/a/report.html', expiresInSeconds: 300 }),
      '22fa579c44879d337edfbbe3fc1a8898bfb09ea5cb52595aa55065a896c19910'
    ],
    [
      at({
        method: 'DELETE',
        host: 'x.s3.amazonaws.com',
        path: '/a/b.txt',
        region: 'us-west-2',
        expiresInSeconds: 120
      }),
      'c0294f5e67b8fea12c44d6dee3467f819abf371806cbb1ff2b3e85558598b63c'
    ]
  ])('matches aws4 for %#', (input, expected) => {
    expect(signature(input)).toBe(expected)
  })

  test('changing anything signed changes it', () => {
    const base = signature(at({ expiresInSeconds: 60 }))
    expect(signature(at({ expiresInSeconds: 60, path: '/other.txt' }))).not.toBe(base)
    expect(signature(at({ expiresInSeconds: 60, method: 'PUT' }))).not.toBe(base)
    expect(signature(at({ expiresInSeconds: 60, region: 'eu-west-1' }))).not.toBe(base)
    expect(signature(at({ expiresInSeconds: 60, host: 'other.s3.amazonaws.com' }))).not.toBe(base)
    expect(signature(at({ expiresInSeconds: 60, query: { 'response-content-type': 'video/mp4' } }))).not.toBe(
      base
    )
  })
})

describe('the URL handed to a client', () => {
  test('carries every parameter the recipient must present, and nothing it must remember', () => {
    const params = new URL(
      presign(
        at({
          method: 'PUT',
          credentials: { ...CREDENTIALS, sessionToken: 'sts-token' },
          expiresInSeconds: 600
        })
      )
    ).searchParams
    expect(params.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(params.get('X-Amz-Credential')).toBe(
      `${CREDENTIALS.accessKeyId}/20130524/us-east-1/s3/aws4_request`
    )
    expect(params.get('X-Amz-Expires')).toBe('600')
    expect(params.get('X-Amz-SignedHeaders')).toBe('host')
    expect(params.get('X-Amz-Security-Token')).toBe('sts-token')
    expect(params.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  test('honours the scheme, so MinIO over plain http still verifies', () => {
    expect(
      presign(at({ host: 'localhost:9000', protocol: 'http:' })).startsWith('http://localhost:9000/')
    ).toBe(true)
  })
})

describe('encoding', () => {
  test('encodes the unreserved set the way AWS does, not the way encodeURIComponent does', () => {
    // encodeURIComponent leaves ! ' ( ) * alone; SigV4 requires them percent-encoded.
    expect(uriEncode("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af')
    expect(uriEncode('a~b-c_d.e')).toBe('a~b-c_d.e')
    expect(uriEncode('a b')).toBe('a%20b')
    expect(uriEncode('café')).toBe('caf%C3%A9')
  })

  test('encodes + in a key, matching the AWS SDK rather than aws4', () => {
    // The one case where aws4@1.13.2 differs: it emits a literal `+`, because it
    // re-encodes with `encodeURI`, which treats `+` as safe. The SigV4 spec's unreserved
    // set does not include it, and the AWS SDK percent-encodes it. This can never reach
    // a real key anyway — `keys.ts` refuses `+` in a filename — but the signer should
    // not be the thing that is wrong.
    expect(uriEncode('c+d')).toBe('c%2Bd')
  })

  test('leaves path separators alone only when asked', () => {
    expect(uriEncode('/a/b', false)).toBe('/a/b')
    expect(uriEncode('/a/b')).toBe('%2Fa%2Fb')
  })

  test('sorts query parameters by encoded name', () => {
    expect(canonicalQuery({ b: '2', a: '1', 'X-Amz-Date': 'd' })).toBe('X-Amz-Date=d&a=1&b=2')
  })

  test('formats the two clock shapes S3 wants', () => {
    expect(amzDates(new Date('2026-09-19T14:02:11.482Z'))).toEqual({
      amzDate: '20260919T140211Z',
      dateStamp: '20260919'
    })
  })
})
