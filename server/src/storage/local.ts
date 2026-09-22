import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { PREFLIGHT_PREFIX } from './keys.ts'
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
 * The filesystem, for development and for a single-tenant install that has no bucket.
 *
 * The thing that makes this worth writing rather than stubbing is `signedUrl`. A local
 * folder has nothing to presign against, so the obvious shortcut is to let the dev path
 * skip signing and stream bytes through the server — and that shortcut is exactly how a
 * prototype ends up with an upload flow that works locally and has never once been
 * exercised in the shape production uses. So this mints a URL back at the server, signed
 * with an HMAC over the same fields S3 puts in a query string, and the desktop client
 * cannot tell the two apart: it receives a URL and a method, and it PUTs.
 *
 * The one thing it cannot fake is that S3's signature is verified by S3. Here the server
 * verifies it, which means the bytes do transit this process. That is fine for dev and
 * it is the documented reason not to run this provider for a team.
 */

export type LocalConfig = {
  /** Absolute or relative directory the objects live under. */
  root: string
  /** Where the signed URLs point — this server, as the outside world addresses it. */
  publicUrl: string
  /** Signs the URLs. Distinct from the token secret, so rotating one is not rotating both. */
  signingSecret: string
}

/** The path signed URLs are served from. Mounted by `http/router.ts`. */
export const LOCAL_STORAGE_PATH = '/_storage'

const contentTypeFile = (path: string): string => `${path}.content-type`

/**
 * Refuse a key that would escape the root.
 *
 * `keys.ts` already validates every segment, but this is the layer that touches the
 * filesystem and it must not depend on a caller two modules away having been careful.
 */
function pathFor(root: string, key: StorageKey): string {
  const base = resolve(root)
  const target = resolve(base, key)
  if (target !== base && !target.startsWith(base + sep)) {
    throw new StorageError('failed', `Key escapes the storage root: ${JSON.stringify(key)}`)
  }
  return target
}

type SignedFields = { key: string; method: string; expiresAt: number }

/** What the HMAC covers. Order is fixed, and `\n` cannot appear in a key. */
const payload = (f: SignedFields): string => `${f.method}\n${f.key}\n${f.expiresAt}`

export const signLocalUrl = (secret: string, fields: SignedFields): string =>
  createHmac('sha256', secret).update(payload(fields)).digest('hex')

export type LocalUrlCheck = { ok: true } | { ok: false; why: string }

/**
 * Verify a signed local URL. Separate from the provider and pure, because this is the
 * only place in the prototype where an unauthenticated request reaches storage.
 */
export function verifyLocalUrl(
  secret: string,
  fields: SignedFields,
  providedSignature: string,
  now: number
): LocalUrlCheck {
  if (fields.expiresAt <= now) return { ok: false, why: 'This link has expired.' }
  const expected = Buffer.from(signLocalUrl(secret, fields))
  const provided = Buffer.from(providedSignature)
  if (expected.length !== provided.length) return { ok: false, why: 'Signature does not match.' }
  if (!timingSafeEqual(expected, provided)) return { ok: false, why: 'Signature does not match.' }
  return { ok: true }
}

async function readContentType(path: string): Promise<string | null> {
  try {
    return await readFile(contentTypeFile(path), 'utf-8')
  } catch {
    return null
  }
}

export function createLocalProvider(config: LocalConfig): StorageProvider {
  if (!config.signingSecret) {
    throw new StorageError('misconfigured', 'The local provider needs SNAPIT_TOKEN_SECRET to sign URLs.')
  }
  const root = resolve(config.root)

  const describe = async (key: StorageKey): Promise<StoredObject | null> => {
    const path = pathFor(root, key)
    try {
      const info = await stat(path)
      if (!info.isFile()) return null
      return {
        key,
        bytes: info.size,
        contentType: await readContentType(path),
        updatedAt: new Date(info.mtimeMs).toISOString(),
        // Cheap and good enough to make `If-None-Match` work: size and mtime together
        // change on every write the server can make.
        etag: `"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`
      }
    } catch {
      return null
    }
  }

  return {
    id: 'local',

    async preflight() {
      const key = `${PREFLIGHT_PREFIX}${randomUUID()}.txt`
      try {
        await this.put(key, Buffer.from('snapit preflight'), { contentType: 'text/plain' })
      } catch (err) {
        throw new StorageError(
          'misconfigured',
          `Cannot write under ${root}. Check the path and permissions.`,
          err
        )
      }
      if (!(await describe(key)))
        throw new StorageError('misconfigured', `Wrote ${key} under ${root} but cannot read it back.`)
      await this.delete(key)
    },

    async put(key, body, options: PutOptions) {
      const path = pathFor(root, key)
      await mkdir(dirname(path), { recursive: true })
      // Written to a sibling and renamed, so a failed upload never leaves a file that
      // `head` would report as a complete object.
      const partial = `${path}.part`
      try {
        if (Buffer.isBuffer(body)) await writeFile(partial, body)
        else await pipeline(body, createWriteStream(partial))
        await rename(partial, path)
      } catch (err) {
        await rm(partial, { force: true })
        throw new StorageError('failed', `Could not write ${key}.`, err)
      }
      // The filesystem has nowhere to put a content type, so it goes beside the object.
      await writeFile(contentTypeFile(path), options.contentType, 'utf-8')
      const described = await describe(key)
      if (!described) throw new StorageError('failed', `Wrote ${key} but cannot stat it.`)
      return described
    },

    async get(key, range) {
      if (!(await describe(key))) throw new StorageError('not-found', `No object at ${key}.`)
      // `end` is inclusive for createReadStream, which is the same way HTTP means it — so
      // the range passes through untranslated.
      return range
        ? createReadStream(pathFor(root, key), { start: range.start, end: range.end })
        : createReadStream(pathFor(root, key))
    },

    head: describe,

    async delete(key) {
      const path = pathFor(root, key)
      await rm(path, { force: true })
      await rm(contentTypeFile(path), { force: true })
    },

    async *list(prefix) {
      const start = pathFor(root, prefix)
      const walk = async function* (dir: string): AsyncGenerator<string> {
        let entries: import('node:fs').Dirent[]
        try {
          entries = await readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) yield* walk(full)
          else if (!entry.name.endsWith('.content-type') && !entry.name.endsWith('.part')) yield full
        }
      }
      // A prefix may name a directory or be a partial filename; walking the nearest
      // directory and filtering covers both without a second code path.
      const base = (await stat(start).catch(() => null))?.isDirectory() ? start : dirname(start)
      for await (const full of walk(base)) {
        const key = full
          .slice(root.length + 1)
          .split(sep)
          .join('/')
        if (!key.startsWith(prefix)) continue
        const described = await describe(key)
        if (described) yield described
      }
    },

    async signedUrl(key: StorageKey, options: SignedUrlOptions): Promise<SignedUrl> {
      const method = options.method ?? 'GET'
      const expiresAt = Date.now() + Math.max(1, Math.floor(options.expiresInSeconds)) * 1000
      const signature = signLocalUrl(config.signingSecret, { key, method, expiresAt })
      const url = new URL(`${LOCAL_STORAGE_PATH}/${key}`, config.publicUrl)
      url.searchParams.set('method', method)
      url.searchParams.set('expires', String(expiresAt))
      url.searchParams.set('signature', signature)
      if (options.downloadAs) url.searchParams.set('download', options.downloadAs)
      return { url: url.toString(), method, headers: {}, expiresAt: new Date(expiresAt).toISOString() }
    }
  }
}
