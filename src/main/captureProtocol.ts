import { randomUUID } from 'crypto'
import { createReadStream } from 'fs'
import { readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { BUNDLE_FILES, sanitizeMarkers, type CaptureMeta } from './bundle'
import { renderBundleReport } from './bundleReport'
import {
  CAPTURE_SCHEME,
  MEDIA_CSP,
  REPORT_CSP,
  REPORT_FILE,
  captureUrl,
  mediaKindFor,
  mediaTypeFor,
  parseByteRange,
  parseCaptureUrl,
  type CaptureView
} from './captureUrl'
import { assertInside } from './library'
import { pickBundleMedia } from './mcp/captures'
import { readBundleJson } from './mcp/bundles'

/**
 * Serving a capture to the frame that shows it.
 *
 * Three things are true at once here, and the shape falls out of all three. The report
 * is full of text from someone else's application, so it must not run inside our
 * renderer. It needs its own script to work, so it cannot inherit our renderer's policy.
 * And it addresses its recording by bare filename, so it needs a document URL that a
 * bare filename resolves against. A scheme answers all three; `captureUrl.ts` holds the
 * rules and this holds the electron.
 *
 * Nothing is reachable by default. A bundle becomes readable only when the renderer asks
 * for it by path, that path is checked against the save folder, and what comes back is
 * an opaque id — so a frame can address exactly the capture the user opened and nothing
 * else on the disk, including the other captures beside it.
 */

/**
 * What one grant opens up.
 *
 * `only` is the whole reason this is not just a folder. A loose screenshot lives
 * directly in the save folder, so granting its folder would grant every capture in it —
 * which is most of them. Naming the single file instead keeps a loose capture exactly as
 * narrow as a bundle: one capture, nothing beside it.
 */
type Grant = { dir: string; only: string | null }

const grants = new Map<string, Grant>()

/**
 * Must run before `app.whenReady`, which is what makes it a separate function from
 * `installCaptureProtocol` — a scheme cannot gain privileges after the first page loads.
 *
 * `standard` gives the scheme an origin and a path hierarchy, which is what makes
 * `capture.mp4` resolve against `…/report.html` instead of being a relative path with
 * nothing to be relative to. `stream` is what lets a recording be sought rather than
 * downloaded whole before it plays. `supportFetchAPI` and `corsEnabled` are deliberately
 * absent: nothing on this scheme should be fetchable by script, and `default-src 'none'`
 * in the report's own policy says the same thing from the other side.
 */
export function registerCaptureScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: CAPTURE_SCHEME, privileges: { standard: true, secure: true, stream: true } }
  ])
}

/**
 * Re-granting the same thing returns the id it already has. Otherwise clicking down a
 * list of forty captures would leave forty live grants behind it, and the id in the
 * frame's URL would change on every visit, which reloads the report for no reason.
 */
function idFor(grant: Grant): string {
  for (const [id, held] of grants) {
    if (held.dir === grant.dir && held.only === grant.only) return id
  }
  const id = randomUUID().replace(/-/g, '')
  grants.set(id, grant)
  return id
}

/**
 * What the home window should show for a capture, and the URL to show it from.
 *
 * The path comes from the renderer, so it goes through `assertInside` like every other
 * path the library hands back — here, once, at the point the grant is made, rather than
 * on every request for a file inside it.
 *
 * Throws when there is nothing to show. The renderer says so on the page rather than
 * leaving an empty pane, because a capture that cannot be read is itself worth knowing
 * about: it is usually a folder someone has moved or emptied.
 */
export async function captureView(saveDir: string, capturePath: string): Promise<CaptureView> {
  const target = assertInside(saveDir, capturePath)
  const info = await stat(target)

  if (!info.isDirectory()) {
    const file = basename(target)
    const media = mediaKindFor(file)
    if (!media) throw new Error(`snapit cannot show a ${file.split('.').pop() ?? 'file'} in the app.`)
    return { kind: 'media', url: captureUrl(idFor({ dir: dirname(target), only: file }), file), media }
  }

  // Metadata is the one file the report cannot be rendered without, so it decides which
  // of the two shapes this is — the same condition `readBundleReport` throws on, asked
  // before rendering rather than by catching it afterwards.
  const meta = await readBundleJson<CaptureMeta>(target, BUNDLE_FILES.meta)
  if (meta?.capture) {
    return {
      kind: 'report',
      url: captureUrl(idFor({ dir: target, only: null }), REPORT_FILE),
      // Handed over with the view rather than fetched separately: the editor beside the
      // frame needs the markers themselves, not the count the library carries, and this
      // is already the one round trip that happens per selection.
      markers: sanitizeMarkers(meta.capture.markers, meta.capture.durationMs ?? null),
      durationMs: meta.capture.durationMs ?? null,
      /** A rail can only be drawn on something that plays. */
      seekable: meta.media !== null && mediaKindFor(meta.media.file) === 'video'
    }
  }

  // A bundle whose metadata is missing or truncated. `libraryEntry.ts` lists it anyway,
  // on the principle that a capture that exists must still be listed, and the same
  // applies here: the recording inside it is still worth watching.
  const mediaFile = pickBundleMedia(await namesIn(target), null)
  const media = mediaFile ? mediaKindFor(mediaFile) : null
  if (!mediaFile || !media) throw new Error(`${basename(target)} has no readable metadata or media.`)
  return {
    kind: 'media',
    url: captureUrl(idFor({ dir: target, only: mediaFile }), mediaFile),
    media
  }
}

/** An unreadable folder has nothing in it as far as this is concerned. */
async function namesIn(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/** Drop every grant. Called when the home window closes, so nothing outlives its reader. */
export function revokeCaptureAccess(): void {
  grants.clear()
}

const deny = (status: number): Response =>
  new Response(null, { status, headers: { 'content-security-policy': MEDIA_CSP } })

/**
 * Register the handler. After `app.whenReady`.
 *
 * Every response carries a policy, including the refusals — a 404 body is still a
 * document as far as the frame is concerned, and one served with no policy at all would
 * be the only thing on this scheme that had none.
 */
export function installCaptureProtocol(): void {
  protocol.handle(CAPTURE_SCHEME, async (request) => {
    const asked = parseCaptureUrl(request.url)
    if (!asked) return deny(400)
    const grant = grants.get(asked.id)
    if (!grant) return deny(404)
    // A single-file grant opens one file, and `report.html` is never that file: there is
    // no bundle behind it to render one from.
    if (grant.only !== null && asked.file !== grant.only) return deny(404)

    if (asked.file === REPORT_FILE) {
      try {
        // Rendered now, from the bundle's own JSON, rather than read off disk. The
        // `report.html` beside it was written once at capture time and every improvement
        // to the report since has passed it by; see `STATUS.md` on why the file is still
        // written and still not what the app reads.
        return new Response(await renderBundleReport(grant.dir), {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': REPORT_CSP,
            // The report is rebuilt per request and must never be remembered: a capture
            // deleted and its id reused would otherwise show the old one.
            'cache-control': 'no-store'
          }
        })
      } catch (err) {
        console.error('[snapit] could not render a report for the home window:', err)
        return deny(500)
      }
    }

    const type = mediaTypeFor(asked.file)
    if (!type) return deny(404)
    try {
      return serveMedia(join(grant.dir, asked.file), type, request.headers.get('range'))
    } catch {
      // A capture whose media was moved or deleted underneath us. The report still
      // renders; its player is what breaks, and it says so on the page.
      return deny(404)
    }
  })
}

/**
 * Serve a media file, honouring ranges, streaming rather than buffering.
 *
 * Both halves are load-bearing. A recording is hundreds of megabytes, so reading one
 * into a buffer to answer a request for four seconds of it would cost the whole file in
 * the process that owns every window — the same arithmetic that made the single-file
 * export stream in `standaloneFile.ts`. And a player seeks by asking for a range: answer
 * that with the whole file and it plays from the start and refuses to move, which is
 * what it did before this existed.
 */
async function serveMedia(path: string, type: string, range: string | null): Promise<Response> {
  const info = await stat(path)
  if (!info.isFile()) return deny(404)
  const asked = parseByteRange(range, info.size)
  const { start, end } = asked ?? { start: 0, end: Math.max(0, info.size - 1) }

  const headers = new Headers({
    'content-type': type,
    'content-security-policy': MEDIA_CSP,
    // Without this the player will not even try to seek, whatever the handler would
    // have answered.
    'accept-ranges': 'bytes',
    'content-length': String(end - start + 1)
  })
  if (asked) headers.set('content-range', `bytes ${start}-${end}/${info.size}`)

  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>
  return new Response(body, { status: asked ? 206 : 200, headers })
}
