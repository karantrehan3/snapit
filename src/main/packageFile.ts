import { createWriteStream } from 'fs'
import { rename, rm, stat } from 'fs/promises'
import { basename, join } from 'path'
import { ZipFile } from 'yazl'
import { BUNDLE_FILES, type CaptureMeta } from './bundle'
import { renderBundleReport } from './bundleReport'
import { readBundleJson } from './mcp/bundles'
import { estimatedPackageBytes, packageReadme } from './standalone'

/**
 * Writing a bundle out as one `.zip`.
 *
 * The other half of sharing, and the half that scales. A single `.html` needs nothing of
 * the recipient, which is why it stays the default — but base64 costs a third of the
 * recording, and the recording is nearly all of it: a 33-minute capture is 153 MB on
 * disk and 204 MB as one file, which no mail, chat or issue tracker will accept. In a zip
 * the media is a file at its own size.
 *
 * It needs no change to the report, which is the whole reason this is short.
 * `report.html` already addresses its media by bare filename, because that is how it
 * works inside a bundle folder — so a zipped folder unzips to a working report with a
 * working player, and nothing had to be rewritten to point somewhere else.
 *
 * Kept free of electron, like `standaloneFile.ts`, so the whole path can be run and
 * measured outside the app. `share.ts` puts the dialogs on top.
 */

/** Where to start, since a folder of six files does not say so itself. */
const README = 'README.txt'

/** The siblings, in the order someone opening the folder would want them. */
const SIBLINGS: string[] = [
  BUNDLE_FILES.har,
  BUNDLE_FILES.console,
  BUNDLE_FILES.actions,
  BUNDLE_FILES.spec,
  BUNDLE_FILES.meta
]

async function sizeOf(path: string): Promise<number> {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : 0
  } catch {
    // A bundle legitimately lacks most of these: a recording has no HAR.
    return 0
  }
}

export type PreparedPackage = {
  /** Freshly rendered, so a shared folder carries the current report and not the old one. */
  html: string
  /** Absolute path of the media, when the capture has one. */
  mediaPath: string | null
  /** Bare names of the siblings that actually exist, relative to the bundle. */
  siblings: string[]
  readme: string
  /** Near enough to show someone before they choose. See `estimatedPackageBytes`. */
  estimatedBytes: number
}

/**
 * Work out what goes in, and render the report.
 *
 * The report is re-rendered rather than copied, which is the point worth noticing: the
 * `report.html` sitting in the bundle was written once at capture time and every
 * improvement since has passed it by. Sharing has always re-rendered — that was the
 * asymmetry `STATUS.md` called a wart — and now a shared *folder* does too, so the zip
 * and the single file and the in-app view are all the same page.
 */
export async function preparePackage(dir: string): Promise<PreparedPackage> {
  const html = await renderBundleReport(dir)
  const meta = await readBundleJson<CaptureMeta>(dir, BUNDLE_FILES.meta)
  const media = meta?.media ?? null

  const mediaPath = media ? join(dir, media.file) : null
  const mediaBytes = mediaPath ? await sizeOf(mediaPath) : 0
  if (mediaPath && mediaBytes === 0) {
    throw new Error(`${basename(mediaPath)} is missing from this capture, so it cannot be shared.`)
  }

  const found = await Promise.all(
    SIBLINGS.map(async (name) => ((await sizeOf(join(dir, name))) > 0 ? name : null))
  )
  const siblings = found.filter((n): n is string => n !== null)
  const siblingBytes = (await Promise.all(siblings.map((n) => sizeOf(join(dir, n))))).reduce(
    (a, b) => a + b,
    0
  )
  const readme = packageReadme(basename(dir), mediaPath !== null)

  return {
    html,
    mediaPath,
    siblings,
    readme,
    estimatedBytes: estimatedPackageBytes(
      mediaBytes,
      siblingBytes + Buffer.byteLength(html) + Buffer.byteLength(readme)
    )
  }
}

/**
 * Write the zip. Returns its size on disk.
 *
 * The media goes in by path so yazl streams it off disk rather than being handed a
 * buffer — the same reason the single-file export streams its base64, and the same
 * failure avoided: holding a 153 MB recording in the process that owns every window.
 *
 * Written to a sibling and renamed, so a failure halfway through leaves nothing that
 * looks like a finished package. `rename` within a directory is atomic.
 */
export async function writePackage(dir: string, prepared: PreparedPackage, target: string): Promise<number> {
  const partial = `${target}.part`
  const inside = basename(target).replace(/\.zip$/i, '')

  try {
    await new Promise<void>((resolve, reject) => {
      const zip = new ZipFile()
      const out = createWriteStream(partial)
      out.on('error', reject)
      out.on('close', () => resolve())
      zip.outputStream.on('error', reject)
      zip.outputStream.pipe(out)

      // Everything sits in one folder inside the archive, so unzipping never scatters
      // six files across whatever directory it happened to land in.
      const at = (name: string): string => `${inside}/${name}`

      zip.addBuffer(Buffer.from(prepared.readme, 'utf-8'), at(README))
      zip.addBuffer(Buffer.from(prepared.html, 'utf-8'), at(BUNDLE_FILES.report))
      if (prepared.mediaPath) zip.addFile(prepared.mediaPath, at(basename(prepared.mediaPath)))
      for (const name of prepared.siblings) zip.addFile(join(dir, name), at(name))
      zip.end()
    })
    await rename(partial, target)
  } catch (err) {
    await rm(partial, { force: true })
    throw err
  }
  return (await stat(target)).size
}
