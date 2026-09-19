import type { Readable } from 'node:stream'

/**
 * The seam between snapit's server and wherever the customer keeps their bytes.
 *
 * The point of this interface is not portability for its own sake — it is that a
 * capture's artifacts are the customer's data, sitting in the customer's bucket, under
 * the customer's retention policy. That is the one thing a hosted snapit can offer that
 * Jam cannot, and it only stays true if nothing above this line knows what S3 is.
 *
 * Two rules the implementations share, both learned from what a capture actually is:
 *
 * 1. **Bytes must be able to bypass the server.** A recording is routinely 150 MB and a
 *    33-minute one is 560 MB. Streaming that through the metadata service would make the
 *    service the bottleneck and the cost centre for data it is not supposed to hold. So
 *    `signedUrl` is not a convenience — it is the upload and download path, and the
 *    server only ever handles the small files.
 * 2. **A provider that cannot do something says so at construction.** A bucket with the
 *    wrong CORS produces a link that works for the uploader and 403s for the recipient
 *    (ROADMAP M1.7, cost #2). Failing late, in a viewer, is how snapit gets blamed for
 *    someone else's ACL; `preflight()` exists so it fails at configuration instead.
 */

/**
 * A slash-delimited object key. Always built by `src/storage/keys.ts`, never by hand —
 * the key layout is what makes a workspace's objects deletable as a prefix.
 */
export type StorageKey = string

export type StorageProviderId = 'local' | 's3' | 'azure' | 'gcs'

export type StoredObject = {
  key: StorageKey
  bytes: number
  contentType: string | null
  /** ISO. Null when the provider does not report one. */
  updatedAt: string | null
  /** Opaque; for `If-None-Match` on the viewer. Null when unavailable. */
  etag: string | null
}

export type PutOptions = {
  contentType: string
  /**
   * Required whenever the body is a stream: object stores need a length up front and
   * the ones that accept chunked encoding charge more for it.
   */
  contentLength?: number
  cacheControl?: string
}

export type SignedUrlOptions = {
  expiresInSeconds: number
  /**
   * `GET` for a download or a viewer, `PUT` for a direct upload from the desktop app.
   * Anything else is deliberately not offered — a signed `DELETE` handed to a client is
   * a retention policy a client can defeat.
   */
  method?: 'GET' | 'PUT'
  /** Sets `Content-Disposition: attachment; filename=…`, for a "download the HAR" link. */
  downloadAs?: string
  /** Overrides the stored content type on the response. */
  responseContentType?: string
}

export type SignedUrl = {
  url: string
  method: 'GET' | 'PUT'
  /** Headers the client MUST send for the signature to verify. Often empty. */
  headers: Record<string, string>
  /** ISO. */
  expiresAt: string
}

export interface StorageProvider {
  readonly id: StorageProviderId

  /**
   * Prove the configuration works before any capture depends on it. Writes, reads back
   * and deletes a probe object. Resolves to nothing, or throws `StorageError`.
   */
  preflight(): Promise<void>

  put(key: StorageKey, body: Readable | Buffer, options: PutOptions): Promise<StoredObject>

  /** Only for the small files — the report, the HAR, the metadata. Never the media. */
  get(key: StorageKey): Promise<Readable>

  /** Null when the object is absent, rather than throwing: absence is an answer. */
  head(key: StorageKey): Promise<StoredObject | null>

  delete(key: StorageKey): Promise<void>

  /** Paged internally; yields every object under the prefix. Used to delete a capture. */
  list(prefix: string): AsyncIterable<StoredObject>

  signedUrl(key: StorageKey, options: SignedUrlOptions): Promise<SignedUrl>
}

export type StorageErrorCode =
  | 'misconfigured'
  | 'not-found'
  | 'denied'
  | 'unreachable'
  | 'unsupported'
  | 'failed'

/**
 * One error type across every provider, because the API layer has to map a failure to a
 * status code without knowing which cloud it came from.
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode
  override readonly cause?: unknown

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    this.cause = cause
  }
}

export const storageStatus: Record<StorageErrorCode, number> = {
  misconfigured: 500,
  'not-found': 404,
  denied: 502,
  unreachable: 502,
  unsupported: 501,
  failed: 502
}
