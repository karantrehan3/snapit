import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'
import { LOCAL_STORAGE_PATH, verifyLocalUrl } from '../storage/local.ts'
import type { StorageProvider } from '../storage/provider.ts'

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
  res.writeHead(200, {
    'content-type': object.contentType ?? 'application/octet-stream',
    'content-length': object.bytes,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(download ? { 'content-disposition': `attachment; filename="${download.replace(/"/g, '')}"` } : {}),
    // A recording is played with a range request; without this the player cannot seek.
    'accept-ranges': 'none'
  })
  await pipeline(await storage.get(key), res)
}
