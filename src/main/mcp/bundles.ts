import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { BUNDLE_FILES } from '../bundle'
import { resolveBundleDir } from './captures'

/**
 * Reading bundles back off disk for the MCP tools.
 *
 * A bundle is the unit an agent asks about, and it is almost always the most recent one
 * — so `bundle` is optional everywhere and defaults to the newest. When it is given it
 * goes through resolveBundleDir first, because the name came from a model.
 */

/** A directory counts as a bundle once it has metadata describing itself. */
async function hasMeta(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, BUNDLE_FILES.meta))).isFile()
  } catch {
    return false
  }
}

export async function newestBundleDir(saveDir: string): Promise<string | null> {
  let entries: import('fs').Dirent[]
  try {
    entries = await readdir(saveDir, { withFileTypes: true })
  } catch {
    return null
  }

  const dated = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const dir = join(saveDir, e.name)
        if (!(await hasMeta(dir))) return null
        try {
          return { dir, mtimeMs: (await stat(dir)).mtimeMs }
        } catch {
          return null
        }
      })
  )

  return (
    dated
      .filter((d): d is { dir: string; mtimeMs: number } => d !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.dir ?? null
  )
}

/** The bundle a tool call is about: the one named, or the most recent. */
export async function targetBundle(saveDir: string, given?: string): Promise<string> {
  if (given) {
    const dir = resolveBundleDir(saveDir, given)
    if (!(await hasMeta(dir))) throw new Error(`No bundle at ${given} (no ${BUNDLE_FILES.meta} inside it).`)
    return dir
  }
  const newest = await newestBundleDir(saveDir)
  if (!newest) {
    throw new Error('No bundles in the save folder yet. Record something, or run a browser session, first.')
  }
  return newest
}

/** Read one of a bundle's JSON files, or null when it is absent or unreadable. */
export async function readBundleJson<T>(dir: string, file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(dir, file), 'utf-8')) as T
  } catch {
    // A bundle may legitimately lack a file — a recording has no HAR, and the save path
    // deliberately tolerates metadata that failed to write.
    return null
  }
}
