import { readdir, readFile, stat } from 'fs/promises'
import { basename, dirname, join, resolve, sep } from 'path'
import { nativeImage, shell } from 'electron'
import { BUNDLE_FILES } from './bundle'
import { isCaptureFile, pickBundleMedia } from './mcp/captures'
import { bundleEntry, fileEntry, sortEntries, type LibraryEntry } from './libraryEntry'

/**
 * Reading the save folder for the library window.
 *
 * The MCP tool lists the same folder, but for a different reader: an agent wants paths
 * and sizes, and a person wants to recognise a capture on sight — what went wrong in it,
 * how long it ran, what it looked like. Rather than bend one shape to both, this shares
 * the pure parts (`pickBundleMedia`, `isCaptureFile`) and builds its own.
 *
 * Nothing here throws for one bad entry. A folder that cannot be described is still one
 * someone can open and delete, and a single unreadable capture must not empty the window.
 */

const THUMB_MAX = 480

async function readMeta(dir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, BUNDLE_FILES.meta), 'utf-8'))
  } catch {
    // Missing or malformed metadata is not fatal: the entry falls back to what the
    // filesystem itself can say.
    return null
  }
}

/** Total bytes in a bundle — what someone deciding whether to delete it wants to know. */
async function folderBytes(dir: string, names: string[]): Promise<number> {
  const sizes = await Promise.all(
    names.map(async (name) => {
      try {
        const info = await stat(join(dir, name))
        return info.isFile() ? info.size : 0
      } catch {
        return 0
      }
    })
  )
  return sizes.reduce((a, b) => a + b, 0)
}

async function describeBundle(dir: string): Promise<LibraryEntry | null> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  const meta = await readMeta(dir)
  const metaMedia = (meta as { media?: { file?: unknown } } | null)?.media?.file
  const mediaFile = pickBundleMedia(names, typeof metaMedia === 'string' ? metaMedia : null)
  const hasReport = names.includes(BUNDLE_FILES.report)
  // A folder with neither media nor a report is not one of ours.
  if (!mediaFile && !hasReport) return null
  let mtimeMs = Date.now()
  try {
    mtimeMs = (await stat(dir)).mtimeMs
  } catch {
    // Keep the default; capturedAt from metadata almost always wins anyway.
  }
  return bundleEntry({
    dir,
    name: basename(dir),
    mediaFile,
    hasReport,
    bytes: await folderBytes(dir, names),
    mtimeMs,
    meta
  })
}

async function describeFile(saveDir: string, name: string): Promise<LibraryEntry | null> {
  const path = join(saveDir, name)
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return fileEntry({ path, name, bytes: info.size, mtimeMs: info.mtimeMs })
  } catch {
    return null
  }
}

export async function listLibrary(saveDir: string): Promise<LibraryEntry[]> {
  let dirents: import('fs').Dirent[]
  try {
    dirents = await readdir(saveDir, { withFileTypes: true })
  } catch {
    // No save folder yet is the first-run state, not an error.
    return []
  }
  const found = await Promise.all(
    dirents.map((d) =>
      d.isDirectory()
        ? describeBundle(join(saveDir, d.name))
        : isCaptureFile(d.name)
          ? describeFile(saveDir, d.name)
          : Promise.resolve(null)
    )
  )
  return sortEntries(found.filter((e): e is LibraryEntry => e !== null))
}

/**
 * A thumbnail for a capture, or null when the platform cannot make one.
 *
 * `createThumbnailFromPath` goes through the OS thumbnail service, which is what gets
 * a frame out of an MP4 without decoding it here. It is unsupported on Linux and can
 * fail on any file, so a still falls back to reading the image directly and everything
 * else falls back to nothing — the tile is designed to work without one.
 */
export async function thumbnailFor(path: string): Promise<string | null> {
  try {
    const image = await nativeImage.createThumbnailFromPath(path, { width: THUMB_MAX, height: THUMB_MAX })
    if (!image.isEmpty()) return image.toDataURL()
  } catch {
    // Fall through to the still-image path below.
  }
  try {
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return null
    return image.resize({ width: Math.min(THUMB_MAX, image.getSize().width) }).toDataURL()
  } catch {
    return null
  }
}

/**
 * Refuse anything outside the save folder.
 *
 * The path comes back from the renderer, and this one deletes. A capture's path is
 * always something the library itself listed, so a path that escapes means something is
 * wrong rather than something is unusual — refuse rather than clamp.
 */
export function assertInside(saveDir: string, path: string): string {
  const root = resolve(saveDir)
  const target = resolve(path)
  if (target === root || !target.startsWith(root + sep)) {
    throw new Error('That capture is not inside the snapit save folder.')
  }
  return target
}

/**
 * Move a capture to the trash rather than unlinking it.
 *
 * Deleting is the one irreversible thing the library can do, and a recording of a bug
 * that only happened once is not something to be confident about on the user's behalf.
 * The trash makes the decision reversible where the filesystem would not.
 */
export async function deleteCapture(saveDir: string, path: string): Promise<void> {
  await shell.trashItem(assertInside(saveDir, path))
}

/** Where to reveal a capture: the bundle folder itself, or a loose file in its folder. */
export const revealTarget = (entry: { path: string; reportPath: string | null }): string =>
  entry.reportPath ?? entry.path

export const parentOf = (path: string): string => dirname(path)
