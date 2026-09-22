import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'
import { LOCAL_STORAGE_PATH, verifyLocalUrl } from '@snapit/core/storage/local'
import { contentRange, isClientDisconnect, parseByteRange, rangeLength } from '@snapit/core/range'
import type { StorageProvider } from '@snapit/core/storage/provider'

/**
 * Serving the signed URLs the local provider mints.
 *
 * Mounted only when the local provider is in use. It exists so that the desktop client
 * follows the same protocol in development as it does against S3 — declare, PUT to a
 * signed URL, complete — rather than development exercising a path production never
 * takes. See the note at the top of `storage/local.ts`.
 *
 * This is the one unauthenticated write in the system, so the order here is strict:
 * verify the signature, then act. Nothing is read off the request before it verifies.
 */

export const isLocalStoragePath = (pathname: string): boolean =>
  pathname === LOCAL_STORAGE_PATH || pathname.startsWith(`${LOCAL_STORAGE_PATH}/`)

export async function handleLocalStorage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  storage: StorageProvider,
  secret: string
): Promise<void> {
  const key = decodeURIComponent(url.pathname.slice(LOCAL_STORAGE_PATH.length + 1))
  const method = req.method === 'PUT' ? 'PUT' : 'GET'
  const expires = Number(url.searchParams.get('expires') ?? 0)
  const signature = url.searchParams.get('signature') ?? ''

  const check = verifyLocalUrl(secret, { key, method, expiresAt: expires }, signature, Date.now())
  if (!check.ok) {
    res.writeHead(403, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(check.why)
    return
  }
  // The method the URL was signed for must be the method being used: a GET link must
  // not become a write.
  if (url.searchParams.get('method') !== method) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('This link is not valid for that method.')
    return
  }

  if (method === 'PUT') {
    await storage.put(key, req, {
      contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
      contentLength: Number(req.headers['content-length'] ?? 0) || undefined
    })
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    return
  }

  const object = await storage.head(key)
  if (!object) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('No such object.')
    return
  }

  const download = url.searchParams.get('download')
  const common = {
    'content-type': object.contentType ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // Advertised so a player knows it may seek at all. Chrome checks this before it will
    // let you scrub a video.
    'accept-ranges': 'bytes',
    ...(download ? { 'content-disposition': `attachment; filename="${download.replace(/"/g, '')}"` } : {})
  }

  const wanted = parseByteRange(req.headers.range, object.bytes)
  if (wanted.kind === 'unsatisfiable') {
    res.writeHead(416, { ...common, 'content-range': `bytes */${object.bytes}` }).end()
    return
  }

  const range = wanted.kind === 'partial' ? wanted.range : null
  res.writeHead(range ? 206 : 200, {
    ...common,
    'content-length': range ? rangeLength(range) : object.bytes,
    ...(range ? { 'content-range': contentRange(range, object.bytes) } : {})
  })

  try {
    await pipeline(await storage.get(key, range ?? undefined), res)
  } catch (err) {
    // A player aborts every time somebody seeks or leaves the page. The headers went out
    // long before, so there is nothing to say to the client and nothing worth logging —
    // this used to propagate and take the process with it.
    if (!isClientDisconnect(err)) throw err
    res.destroy()
  }
}
