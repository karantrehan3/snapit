import { createReadStream, createWriteStream } from 'fs'
import { readFile, rename, rm, stat } from 'fs/promises'
import { basename, join } from 'path'
import { pipeline } from 'stream/promises'
import { BUNDLE_FILES, humanBytes } from './bundle'
import { readBundleReport } from './bundleReport'
import { renderReport, type ReportAttachment } from './report'
import {
  MEDIA_PLACEHOLDER,
  base64Length,
  createBase64Encoder,
  dataUri,
  mimeFor,
  splitOnMedia
} from './standalone'

/**
 * Reading a bundle and writing it back out as one file.
 *
 * Kept free of electron so the whole path can be run outside the app — which is how the
 * size figures in `STATUS.md` were measured, and the only honest way to check that a
 * long recording does not cost a gigabyte of heap. `share.ts` puts the dialogs on top.
 */

/**
 * Read in one piece; the media is the only file large enough to need streaming.
 *
 * A backstop rather than a measured limit — the largest HAR seen in practice is 4.8 MB,
 * six times under this. It exists because a session against a page that streams for an
 * hour has no upper bound, and reading that into a string inside the process that owns
 * every window is the one failure mode worth refusing outright.
 */
const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024

/** 3 MB, and divisible by three so most chunks encode with no remainder to carry. */
const MEDIA_CHUNK_BYTES = 3 * 1024 * 1024

/** The sibling files, in the order someone would want them. */
const ATTACHMENTS = [
  BUNDLE_FILES.har,
  BUNDLE_FILES.console,
  BUNDLE_FILES.actions,
  BUNDLE_FILES.spec,
  BUNDLE_FILES.meta
]

async function readAttachment(dir: string, name: string): Promise<ReportAttachment | null> {
  let bytes: number
  try {
    const info = await stat(join(dir, name))
    if (!info.isFile()) return null
    bytes = info.size
  } catch {
    // A bundle legitimately lacks most of these: a recording has no HAR.
    return null
  }
  if (bytes > MAX_ATTACHMENT_BYTES) return { name, bytes }
  const ext = name.slice(name.lastIndexOf('.') + 1)
  const base64 = (await readFile(join(dir, name))).toString('base64')
  return { name, bytes, href: dataUri(mimeFor(ext), base64) }
}

async function mediaSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    throw new Error(`${basename(path)} is missing from this capture, so it cannot be shared.`)
  }
}

export type Prepared = {
  html: string
  /** Absolute path of the media, when there is one and it is being inlined. */
  mediaPath: string | null
  /** What the finished file will weigh, media included. */
  totalBytes: number
}

/**
 * Render the page for a bundle, with the media's base64 still standing in as a marker.
 *
 * The size is exact rather than estimated: everything but the media is already a string
 * here, and base64's length is arithmetic on the media's size. That matters because the
 * threshold decides what the user is offered, and an estimate wrong by a third would
 * offer the wrong thing.
 */
export async function prepareStandalone(dir: string, withMedia: boolean): Promise<Prepared> {
  const { meta, data } = await readBundleReport(dir)
  const attachments = (await Promise.all(ATTACHMENTS.map((name) => readAttachment(dir, name)))).filter(
    (a): a is ReportAttachment => a !== null
  )

  const media = meta.media
  // The size on disk, not the size metadata remembers. They are the same until someone
  // re-encodes the file in place, and the predicted total has to be the real one — it is
  // what the user is shown before deciding. It also surfaces a missing recording here,
  // where it can be said plainly, rather than halfway through writing the page.
  const mediaBytes = media ? await mediaSize(join(dir, media.file)) : 0
  const omitted = media
    ? `The recording (${humanBytes(mediaBytes)}) was left out of this file to keep it sendable. ` +
      `It is still in the capture folder on the machine this came from.`
    : undefined

  const html = renderReport(meta, data, {
    mediaSrc: !media ? undefined : withMedia ? dataUri(mimeFor(media.ext), MEDIA_PLACEHOLDER) : null,
    ...(withMedia ? {} : { mediaOmitted: omitted }),
    attachments
  })

  const inlined = withMedia && media !== null
  return {
    html,
    mediaPath: inlined ? join(dir, media.file) : null,
    totalBytes: Buffer.byteLength(html) + (inlined ? base64Length(mediaBytes) - MEDIA_PLACEHOLDER.length : 0)
  }
}

/**
 * Write the page, streaming the media through base64 rather than holding it.
 *
 * Written to a sibling and renamed, so a failure halfway through leaves nothing that
 * looks like a finished report. `rename` within a directory is atomic.
 */
export async function writeStandalone(prepared: Prepared, target: string): Promise<number> {
  const partial = `${target}.part`
  const media = prepared.mediaPath
  try {
    await pipeline(async function* () {
      if (media === null) {
        yield prepared.html
        return
      }
      const { head, tail } = splitOnMedia(prepared.html)
      yield head
      const encoder = createBase64Encoder()
      for await (const chunk of createReadStream(media, { highWaterMark: MEDIA_CHUNK_BYTES })) {
        const encoded = encoder.push(chunk as Buffer)
        if (encoded) yield encoded
      }
      const last = encoder.flush()
      if (last) yield last
      yield tail
    }, createWriteStream(partial))
    await rename(partial, target)
  } catch (err) {
    await rm(partial, { force: true })
    throw err
  }
  return (await stat(target)).size
}
