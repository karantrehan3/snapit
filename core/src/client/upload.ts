import { createReadStream } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'

/**
 * The desktop half of connected mode: push a bundle folder to a snapit server.
 *
 * It lives here, in the server package, rather than in the app — on purpose. Nothing in
 * `src/main` imports it, nothing in the Electron build references it, and the app is
 * unchanged. What this is, is the *protocol written down and runnable*, so the shape can
 * be exercised end to end before anyone decides whether the app should grow a Share
 * target at all.
 *
 * Where it would attach, if that decision goes the other way, is one place:
 * `src/main/share.ts` already asks which shape to produce — one file, a package, or
 * report-only — and a fourth button ("Upload and copy link") is a case in `chooseShape`
 * plus a call to `pushBundle`. Everything it needs, `preparePackage` already computes.
 *
 * Deliberately dependency-free and Electron-free, so it runs under plain Node.
 */

/** The bundle files snapit writes, and what each is to the server. See `src/main/bundle.ts`. */
const BUNDLE_LAYOUT: ReadonlyArray<{ name: string; role: 'report' | 'data'; contentType: string }> = [
  { name: 'report.html', role: 'report', contentType: 'text/html; charset=utf-8' },
  { name: 'meta.json', role: 'data', contentType: 'application/json' },
  { name: 'console.json', role: 'data', contentType: 'application/json' },
  { name: 'network.har', role: 'data', contentType: 'application/json' },
  { name: 'actions.json', role: 'data', contentType: 'application/json' },
  { name: 'generated.spec.ts', role: 'data', contentType: 'text/plain; charset=utf-8' }
]

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
  png: 'image/png'
}

type DeclaredFile = { name: string; role: 'report' | 'media' | 'data'; bytes: number; contentType: string }

export type PushOptions = {
  /** `https://snapit.example.com`. */
  baseUrl: string
  token: string
  workspaceId: string
  /** The bundle folder on disk. */
  bundleDir: string
  title?: string
  onProgress?: (event: { name: string; bytes: number; done: number; total: number }) => void
}

export type PushResult = {
  captureId: string
  shareUrl: string
  uploadedBytes: number
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function api<T>(options: PushOptions, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${options.baseUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const envelope = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!envelope) throw new Error(`${path} returned ${res.status} with no JSON body.`)
  if (!envelope.ok) throw new Error(`${path} failed: ${envelope.error.message}`)
  return envelope.data
}

/** What the folder actually holds — never what metadata claims it holds. */
export async function describeBundle(bundleDir: string): Promise<DeclaredFile[]> {
  const present = await readdir(bundleDir)
  const files: DeclaredFile[] = []

  for (const entry of BUNDLE_LAYOUT) {
    if (!present.includes(entry.name)) continue
    const info = await stat(join(bundleDir, entry.name))
    if (info.isFile() && info.size > 0) files.push({ ...entry, bytes: info.size })
  }

  // The media keeps the name it would have had as a loose file, so it is found by
  // extension rather than by a fixed name.
  for (const name of present) {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (!MEDIA_TYPES[ext]) continue
    const info = await stat(join(bundleDir, name))
    if (!info.isFile()) continue
    files.push({ name, role: 'media', bytes: info.size, contentType: MEDIA_TYPES[ext]! })
    break
  }

  if (files.length === 0) throw new Error(`${bundleDir} does not look like a snapit bundle.`)
  return files
}

/**
 * Push a bundle: declare, upload direct to storage, then complete.
 *
 * The upload is a stream, not a `readFile`. That mirrors the decision the app already
 * made for its single-file export — measured at 215 MB of resident memory against 1.15 GB
 * on a 167 MB recording — and it matters more here, because the process doing it also
 * owns every window.
 */
export async function pushBundle(options: PushOptions): Promise<PushResult> {
  const files = await describeBundle(options.bundleDir)
  const total = files.reduce((sum, f) => sum + f.bytes, 0)

  const { capture, uploads } = await api<{
    capture: { id: string }
    uploads: Array<{ name: string; url: string; method: string; headers: Record<string, string> }>
  }>(options, `/v1/workspaces/${encodeURIComponent(options.workspaceId)}/captures`, {
    title: options.title ?? basename(options.bundleDir),
    files
  })

  let done = 0
  for (const upload of uploads) {
    const file = files.find((f) => f.name === upload.name)
    if (!file) continue
    const path = join(options.bundleDir, file.name)
    const res = await fetch(upload.url, {
      method: upload.method,
      headers: { ...upload.headers, 'content-type': file.contentType, 'content-length': String(file.bytes) },
      body: Readable.toWeb(createReadStream(path)) as ReadableStream,
      duplex: 'half'
    } as RequestInit)
    if (!res.ok) {
      throw new Error(`Uploading ${file.name} failed: ${res.status} ${res.statusText}`)
    }
    done += file.bytes
    options.onProgress?.({ name: file.name, bytes: file.bytes, done, total })
  }

  // The metadata goes up in `complete`, not as one of the uploaded objects, because the
  // server builds its manifest from it and should not have to fetch it back out of a
  // bucket to do so.
  const meta = await readJsonFile(join(options.bundleDir, 'meta.json'))

  const completed = await api<{ capture: { id: string }; shareUrl: string }>(
    options,
    `/v1/captures/${encodeURIComponent(capture.id)}/complete`,
    { files, meta }
  )

  return { captureId: completed.capture.id, shareUrl: completed.shareUrl, uploadedBytes: done }
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    // A bundle whose metadata cannot be read is still one worth uploading — the server
    // builds a thin manifest from the artifacts instead. Same rule as `libraryEntry.ts`.
    return null
  }
}
