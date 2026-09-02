import { readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { BUNDLE_FILES, sanitizeMarkers, type CaptureMeta, type Marker } from './bundle'
import { assertInside } from './library'

/**
 * Editing the markers of a capture that has already been saved.
 *
 * This is the first thing in snapit that rewrites a bundle. Everything else writes a
 * capture once and then only ever reads it, which is a property worth keeping where it
 * can be kept — so the change is as small as it can be: one array inside meta.json, and
 * nothing else in the file is touched or reformatted.
 *
 * Two consequences follow from it being an edit rather than a save.
 *
 * The write is atomic. A save that dies half-written loses a capture that did not exist
 * a second ago; an *edit* that dies half-written loses a capture that was fine, along
 * with its console, its network and its steps, because meta.json is what makes the
 * folder readable at all. So it goes to a temp file beside it and is renamed over the
 * top, which is atomic on every platform snapit ships to.
 *
 * And the list is sanitized on the way in, by the same function the recorder's markers
 * go through — it arrives from the renderer, so it is untrusted, and a marker past the
 * end of the recording would seek the report's player nowhere.
 */

/** Named so a crash leaves something obviously ours, next to the file it belongs to. */
const TEMP_SUFFIX = '.snapit-tmp'

/**
 * Replace a capture's markers, and return what was actually stored.
 *
 * The returned list is the sanitized one — sorted, rounded, clamped to the recording and
 * capped — so the caller shows what is on disk rather than what it asked for.
 */
export async function setCaptureMarkers(
  saveDir: string,
  capturePath: string,
  raw: unknown
): Promise<Marker[]> {
  const dir = assertInside(saveDir, capturePath)
  const metaPath = join(dir, BUNDLE_FILES.meta)

  const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as CaptureMeta
  if (!meta?.capture) throw new Error('This capture has no metadata to edit.')

  const markers = sanitizeMarkers(raw, meta.capture.durationMs ?? null)
  const next: CaptureMeta = { ...meta, capture: { ...meta.capture, markers } }

  const temp = `${metaPath}${TEMP_SUFFIX}`
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  await rename(temp, metaPath)
  return markers
}

/** A capture's markers, for the editor beside the player. Empty when it has none. */
export async function readCaptureMarkers(dir: string): Promise<Marker[]> {
  try {
    const meta = JSON.parse(await readFile(join(dir, BUNDLE_FILES.meta), 'utf-8')) as CaptureMeta
    return sanitizeMarkers(meta?.capture?.markers, meta?.capture?.durationMs ?? null)
  } catch {
    // A bundle with no readable metadata has no markers to show, and the pane it is
    // shown in still has a recording to play.
    return []
  }
}
