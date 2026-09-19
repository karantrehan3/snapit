import type { ServerResponse } from 'node:http'
import { StorageError, storageStatus } from '../storage/provider.ts'
import { NotFoundError } from '../store/metadata.ts'

/**
 * One response envelope, everywhere.
 *
 * `{ ok, data, error, meta }` rather than a bare body, because a client that has to
 * guess whether a 200 carries a result or a problem is a client that will guess wrong
 * once. The desktop app's uploader in `client/upload.ts` reads exactly this shape.
 */

export type Envelope<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } }

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, 'bad_request', message)
export const unauthorized = (message: string): HttpError => new HttpError(401, 'unauthorized', message)
export const forbidden = (message: string): HttpError => new HttpError(403, 'forbidden', message)
export const notFound = (message: string): HttpError => new HttpError(404, 'not_found', message)
export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message)

export function sendJson<T>(res: ServerResponse, status: number, body: Envelope<T>): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // Nothing this API returns should ever be cached by an intermediary: it is all
    // scoped to a bearer token.
    'cache-control': 'no-store'
  })
  res.end(text)
}

export const sendOk = <T>(res: ServerResponse, data: T, meta?: Record<string, unknown>): void =>
  sendJson(res, 200, meta ? { ok: true, data, meta } : { ok: true, data })

/**
 * Turn any thrown thing into a response.
 *
 * The rule the branches encode: a message the client can act on is returned, and
 * anything else becomes "Something went wrong" with the detail in the server log. An
 * error from a storage provider is the interesting case — its message names a bucket and
 * sometimes a policy, which helps an operator and helps an attacker equally, so only its
 * mapped status crosses the wire.
 */
export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { ok: false, error: { code: err.code, message: err.message } })
    return
  }
  if (err instanceof NotFoundError) {
    sendJson(res, 404, { ok: false, error: { code: 'not_found', message: err.message } })
    return
  }
  if (err instanceof StorageError) {
    console.error('[snapit-server] storage:', err.code, err.message, err.cause ?? '')
    sendJson(res, storageStatus[err.code], {
      ok: false,
      error: {
        code: `storage_${err.code.replace('-', '_')}`,
        message: 'Storage is not answering as expected.'
      }
    })
    return
  }
  console.error('[snapit-server] unhandled:', err)
  sendJson(res, 500, { ok: false, error: { code: 'internal', message: 'Something went wrong.' } })
}
