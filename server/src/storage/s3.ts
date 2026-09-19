import { Readable } from 'node:stream'
import { PREFLIGHT_PREFIX } from './keys.ts'
import { presign, probeName, type SigV4Credentials } from './sigv4.ts'
import {
  StorageError,
  type PutOptions,
  type SignedUrl,
  type SignedUrlOptions,
  type StorageKey,
  type StorageProvider,
  type StoredObject
} from './provider.ts'

/**
 * S3, and everything that speaks S3: AWS, MinIO, Cloudflare R2, Wasabi, Ceph.
 *
 * Four of the five targets in the brief are this one file, which is the argument for
 * the S3 API being the abstraction *below* `StorageProvider` rather than a peer of it.
 * Azure and GCS are genuinely different protocols and get their own files.
 *
 * **Why every operation goes through a presigned URL.** SigV4 has two flavours: signed
 * headers, and a signed query string. Signed headers need a payload hash, which means
 * either buffering the body — a 560 MB recording, in the process that also serves the
 * viewer — or the streaming-chunked variant, which is a second signing implementation.
 * Query-string auth signs only `host`, so one function covers the server's own reads and
 * the URLs handed to the desktop app and the browser. The cost is that a presigned `PUT`
 * authorises writing anything to that key until it expires; every caller here keeps the
 * window in minutes, and `signedUrl` refuses to mint one for longer than an hour.
 */

export type S3Config = {
  bucket: string
  region: string
  credentials: SigV4Credentials
  /** Omit for AWS. MinIO: `http://localhost:9000`. R2: `https://<account>.r2.cloudflarestorage.com`. */
  endpoint?: string
  /** MinIO needs path-style addressing; AWS and R2 do not. */
  forcePathStyle?: boolean
}

/** An hour. Past this a link outlives the reason it was minted, which is a retention hole. */
const MAX_EXPIRY_SECONDS = 3600

type Target = { host: string; path: string; protocol: 'http:' | 'https:' }

function endpointOf(config: S3Config, key: string): Target {
  const base = config.endpoint ?? `https://s3.${config.region}.amazonaws.com`
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new StorageError('misconfigured', `SNAPIT_S3_ENDPOINT is not a URL: ${base}`)
  }
  const protocol = url.protocol === 'http:' ? 'http:' : 'https:'
  const suffix = key ? `/${key}` : '/'
  return config.forcePathStyle
    ? { host: url.host, path: `/${config.bucket}${suffix}`, protocol }
    : { host: `${config.bucket}.${url.host}`, path: suffix, protocol }
}

function urlFor(
  config: S3Config,
  key: string,
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
  expiresInSeconds: number,
  query?: Record<string, string>
): string {
  const { host, path, protocol } = endpointOf(config, key)
  return presign({
    method,
    host,
    path,
    query,
    protocol,
    region: config.region,
    credentials: config.credentials,
    expiresInSeconds,
    now: new Date()
  })
}

/** Map a status onto the one error type the API layer understands. */
async function fail(action: string, key: string, res: Response): Promise<never> {
  const code =
    res.status === 404 ? 'not-found' : res.status === 403 || res.status === 401 ? 'denied' : 'failed'
  // The body is S3's XML error; the `<Message>` in it is the only part worth surfacing,
  // and it is the difference between "denied" and "your bucket policy denies PutObject".
  const body = await res.text().catch(() => '')
  const detail = /<Message>([^<]*)<\/Message>/.exec(body)?.[1]
  throw new StorageError(
    code,
    `S3 ${action} of ${key} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`
  )
}

const objectFrom = (key: string, headers: Headers): StoredObject => ({
  key,
  bytes: Number(headers.get('content-length') ?? 0),
  contentType: headers.get('content-type'),
  updatedAt: headers.get('last-modified') ? new Date(headers.get('last-modified')!).toISOString() : null,
  etag: headers.get('etag')
})

/**
 * Enough of ListObjectsV2's XML to enumerate a prefix, and no more.
 *
 * A real parser is the right call the moment anything else needs one; this reads three
 * fields out of a document shape that has not changed since 2012, and keeping it here
 * means the prototype has no XML dependency. It does assume S3 does not put a `>` inside
 * a key — S3 XML-escapes keys, so that holds.
 */
export function parseListing(xml: string): { objects: StoredObject[]; nextToken: string | null } {
  const field = (block: string, name: string): string | null =>
    new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1] ?? null
  const unescape = (value: string): string =>
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')

  const objects: StoredObject[] = []
  for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = field(block!, 'Key')
    if (!key) continue
    objects.push({
      key: unescape(key),
      bytes: Number(field(block!, 'Size') ?? 0),
      contentType: null,
      updatedAt: field(block!, 'LastModified'),
      etag: field(block!, 'ETag')
    })
  }
  const truncated = field(xml, 'IsTruncated') === 'true'
  return { objects, nextToken: truncated ? field(xml, 'NextContinuationToken') : null }
}

export function createS3Provider(config: S3Config): StorageProvider {
  if (!config.bucket) throw new StorageError('misconfigured', 'SNAPIT_S3_BUCKET is required.')
  if (!config.region) throw new StorageError('misconfigured', 'SNAPIT_S3_REGION is required.')
  if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    throw new StorageError('misconfigured', 'SNAPIT_S3_ACCESS_KEY_ID and …_SECRET_ACCESS_KEY are required.')
  }

  const send = async (
    action: string,
    key: string,
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
    init?: RequestInit,
    query?: Record<string, string>
  ): Promise<Response> => {
    let res: Response
    try {
      res = await fetch(urlFor(config, key, method, 300, query), { method, ...init })
    } catch (err) {
      throw new StorageError('unreachable', `Could not reach the bucket for ${action} of ${key}.`, err)
    }
    return res
  }

  return {
    id: 's3',

    async preflight() {
      const key = `${PREFLIGHT_PREFIX}${probeName()}`
      const put = await send('preflight write', key, 'PUT', {
        body: 'snapit preflight',
        headers: { 'content-type': 'text/plain' }
      })
      if (!put.ok) await fail('preflight write', key, put)
      const got = await send('preflight read', key, 'GET')
      if (!got.ok) await fail('preflight read', key, got)
      await got.text()
      const gone = await send('preflight delete', key, 'DELETE')
      if (!gone.ok) await fail('preflight delete', key, gone)
    },

    async put(key, body, options: PutOptions) {
      const headers: Record<string, string> = { 'content-type': options.contentType }
      if (options.contentLength !== undefined) headers['content-length'] = String(options.contentLength)
      if (options.cacheControl) headers['cache-control'] = options.cacheControl
      // A stream goes up as a stream — the whole reason this provider exists is that a
      // 560 MB recording must never be resident in the process that serves the viewer.
      // `duplex: 'half'` is what Node requires before it will send one.
      // `Buffer.isBuffer`, not `instanceof Buffer`: under TS 6 the latter does not narrow
      // a `Readable | Buffer` union at all, and the stream branch then fails to compile.
      const init: RequestInit = Buffer.isBuffer(body)
        ? { body, headers }
        : ({ body: Readable.toWeb(body) as ReadableStream, headers, duplex: 'half' } as RequestInit)
      const res = await send('put', key, 'PUT', init)
      if (!res.ok) await fail('put', key, res)
      return {
        key,
        bytes: options.contentLength ?? (Buffer.isBuffer(body) ? body.byteLength : 0),
        contentType: options.contentType,
        updatedAt: new Date().toISOString(),
        etag: res.headers.get('etag')
      }
    },

    async get(key) {
      const res = await send('get', key, 'GET')
      if (!res.ok) await fail('get', key, res)
      if (!res.body) throw new StorageError('failed', `S3 returned no body for ${key}.`)
      return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    },

    async head(key) {
      const res = await send('head', key, 'HEAD')
      if (res.status === 404) return null
      if (!res.ok) await fail('head', key, res)
      return objectFrom(key, res.headers)
    },

    async delete(key) {
      const res = await send('delete', key, 'DELETE')
      // S3 reports deleting a missing object as success, and so does this.
      if (!res.ok && res.status !== 404) await fail('delete', key, res)
    },

    async *list(prefix) {
      let token: string | null = null
      do {
        const query: Record<string, string> = {
          'list-type': '2',
          prefix,
          'max-keys': '1000',
          ...(token ? { 'continuation-token': token } : {})
        }
        const res = await send('list', '', 'GET', undefined, query)
        if (!res.ok) await fail('list', prefix, res)
        const parsed = parseListing(await res.text())
        yield* parsed.objects
        token = parsed.nextToken
      } while (token)
    },

    async signedUrl(key: StorageKey, options: SignedUrlOptions): Promise<SignedUrl> {
      const seconds = Math.min(Math.max(1, Math.floor(options.expiresInSeconds)), MAX_EXPIRY_SECONDS)
      const method = options.method ?? 'GET'
      const query: Record<string, string> = {}
      if (options.downloadAs) {
        query['response-content-disposition'] = `attachment; filename="${options.downloadAs}"`
      }
      if (options.responseContentType) query['response-content-type'] = options.responseContentType
      return {
        url: urlFor(config, key, method, seconds, method === 'GET' ? query : undefined),
        method,
        headers: {},
        expiresAt: new Date(Date.now() + seconds * 1000).toISOString()
      }
    }
  }
}
