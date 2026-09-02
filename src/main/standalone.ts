/**
 * Turning a bundle into one file somebody else can open.
 *
 * A bundle works where it was written and nowhere else: `report.html` points at its
 * media by relative name and the JSON sits beside it, so a folder that arrives without
 * its folder is a page with a broken player. The single-file export inlines all of it —
 * media as a data URI, sibling files as download links off data URIs — and the result
 * needs no snapit, no network and no trust to read.
 *
 * The cost is base64, which is four characters for every three bytes. That is a third
 * more than the recording it carries, which is why the size verdict below exists at all.
 *
 * Pure: sizes, mime types, thresholds and the incremental encoder, with no fs and no
 * electron. `share.ts` is the wrapper that reads and writes.
 */

/**
 * Where the media's base64 goes. `renderReport` produces one string, and a long
 * recording must not be turned into one string — so the page is rendered with this
 * marker in the src and split on it, and the encoded media is streamed into the gap.
 */
export const MEDIA_PLACEHOLDER = '__SNAPIT_MEDIA_BASE64__'

/** Exactly what a bundle can hold — three media formats and three attachment kinds. */
const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
  png: 'image/png',
  json: 'application/json',
  har: 'application/json',
  ts: 'text/plain'
}

/** `application/octet-stream` rather than a guess: a wrong type stops a video playing. */
export const mimeFor = (ext: string): string =>
  MIME_TYPES[ext.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream'

/** Exact length of the base64 for n bytes — knowable without encoding anything. */
export const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4

export const dataUri = (mime: string, base64: string): string => `data:${mime};base64,${base64}`

/**
 * Two thresholds, from two different limits, both measured. See `STATUS.md` for the
 * table these come from.
 *
 * **25 MB — what a recipient can be sent.** The smallest attachment limit anyone
 * actually hits: Gmail's, and Jira's default is lower. The encoder writes 3–4 MB a
 * minute, so with base64 on top that is five or six minutes of recording. Above it the
 * export says the number and offers the report without the video, because whether that
 * trade is worth making depends on where it is going and only the sender knows.
 *
 * **512 MB — what a browser will open.** Chrome 151 parsed a 508 MB export in 5.4s and
 * played the inlined recording; at 746 MB the renderer never became responsive at all —
 * a one-line script would not run on it after two minutes. The boundary sits where
 * Blink's maximum string length does, and everything above it is a file that does not
 * open rather than a file that is merely large. That is not a trade to offer, so past
 * this the recording is left out and only the report is written.
 *
 * The gap between them is deliberately wide. The measurements come from a fast machine
 * with memory to spare, and the recipient's may not be — which is what the first
 * threshold is for.
 */
export const SHARE_WARN_BYTES = 25 * 1024 * 1024
export const SHARE_INLINE_LIMIT_BYTES = 512 * 1024 * 1024

export type ShareVerdict = 'ok' | 'large' | 'too-large'

export function shareVerdict(bytes: number): ShareVerdict {
  if (bytes > SHARE_INLINE_LIMIT_BYTES) return 'too-large'
  return bytes > SHARE_WARN_BYTES ? 'large' : 'ok'
}

/**
 * Split the rendered page around the media placeholder.
 *
 * Throws rather than returning the page whole: a silent miss would write a report whose
 * video src is the literal marker, which looks fine until someone presses play.
 */
export function splitOnMedia(html: string): { head: string; tail: string } {
  const at = html.indexOf(MEDIA_PLACEHOLDER)
  if (at === -1) throw new Error('The rendered report has no place to put the media.')
  return { head: html.slice(0, at), tail: html.slice(at + MEDIA_PLACEHOLDER.length) }
}

export type Base64Encoder = {
  /** Base64 for as much of the input as is complete; the remainder waits for more. */
  push: (chunk: Buffer) => string
  /** The last one or two bytes, padded. Nothing may be pushed afterwards. */
  flush: () => string
}

/**
 * Base64 in pieces, so a recording is never a string.
 *
 * `readFile` then `toString('base64')` costs the file's size in a Buffer plus a third
 * more again as a string, and then the same again when it is concatenated into the page.
 * Measured on a 167 MB recording, that is 1.15 GB of resident memory against 215 MB for
 * this — in the process that also owns every window — and 1598 ms against 280 ms. The
 * peak here does not grow with the recording at all: a 560 MB one also cost 213 MB.
 *
 * Base64 encodes three bytes at a time, so a chunk that does not divide by three would
 * be padded mid-stream and every later character would be wrong. The remainder is
 * carried instead, and copied out of its chunk so the chunk itself can be collected.
 */
export function createBase64Encoder(): Base64Encoder {
  let carry = Buffer.alloc(0)
  return {
    push(chunk: Buffer): string {
      const buf = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk
      const whole = buf.length - (buf.length % 3)
      carry = whole === buf.length ? Buffer.alloc(0) : Buffer.from(buf.subarray(whole))
      return whole === 0 ? '' : buf.subarray(0, whole).toString('base64')
    },
    flush(): string {
      if (carry.length === 0) return ''
      const last = carry.toString('base64')
      carry = Buffer.alloc(0)
      return last
    }
  }
}

/** `snapit-2026-08-25_19-40-17.html`, next to nothing else it could collide with. */
export const shareFileName = (bundleName: string): string => `${bundleName.replace(/\.html?$/i, '')}.html`

/**
 * How a capture leaves the machine.
 *
 * `file` is one `.html` with everything inside it. It is the better answer whenever it
 * fits, because it needs nothing of the recipient: no unpacking, no folder, no snapit —
 * double-click and it plays.
 *
 * `package` is a `.zip` of the bundle exactly as it sits on disk. It exists because the
 * single file stops being sendable long before a capture stops being worth sending: a
 * 33-minute recording is 153 MB, base64 makes it 204 MB, and nothing accepts that as an
 * attachment. In a zip the media is a file at its own size — no inflation, and video
 * compresses a little rather than growing by a third. It works with no change to the
 * report at all, because `report.html` already addresses its media by relative name;
 * that is how a bundle folder works today.
 *
 * `report-only` is the escape hatch that was already here: everything except the
 * recording, inlined, for when the destination takes almost nothing.
 */
export type ShareShape = 'file' | 'package' | 'report-only'

/** `snapit-2026-08-25_19-40-17.zip`. */
export const packageFileName = (bundleName: string): string =>
  `${bundleName.replace(/\.(html?|zip)$/i, '')}.zip`

export const shareTargetName = (bundleName: string, shape: ShareShape): string =>
  shape === 'package' ? packageFileName(bundleName) : shareFileName(bundleName)

/**
 * Which shape to offer first, given what the single file would weigh.
 *
 * The single file wins while it is sendable, because it asks nothing of the recipient.
 * Past the attachment limit that argument is gone — an unsendable file is worse than an
 * unpacking step — so the package leads, and past the limit where a browser stops
 * opening the page at all the single file is not offered as a whole capture.
 */
export function suggestedShape(singleFileBytes: number): ShareShape {
  return shareVerdict(singleFileBytes) === 'ok' ? 'file' : 'package'
}

/**
 * What a zip of the bundle will weigh, near enough to show someone before they choose.
 *
 * Measured across five real captures rather than reasoned about, because the first guess
 * — media incompressible, text to a third — was 53% out on the first bundle it met:
 *
 * | Entry                | Deflate saved |
 * | -------------------- | ------------- |
 * | `report.html`        | 70–92%        |
 * | `network.har`        | 93–95%        |
 * | `console.json`       | 79–84%        |
 * | `actions.json`       | 81–92%        |
 * | The recording (.mp4) | 8–37%         |
 *
 * So the text goes to about a tenth, not a third — an inlined report and a HAR are both
 * mostly repeated markup and repeated URLs. And H.264 is *not* incompressible: a static
 * UI recording gave up a third, while the 160 MB one, which is long and busy, gave up
 * only 8%.
 *
 * The media therefore takes the worst case observed (8% saved) rather than the average.
 * That makes the estimate an over-statement for short captures and accurate for long
 * ones — which is the right way round twice over: the number is only ever shown when the
 * single file has already lost on size, and being pleasantly small is the harmless
 * direction to be wrong in. Checked against the 160 MB capture it lands within 0.4%.
 */
export const estimatedPackageBytes = (mediaBytes: number, otherBytes: number): number =>
  Math.ceil(mediaBytes * 0.92) + Math.ceil(otherBytes / 10)

/** The note that goes in the zip, because a folder of files does not say where to start. */
export const packageReadme = (bundleName: string, hasMedia: boolean): string =>
  [
    `${bundleName} — a snapit capture`,
    '',
    'Open report.html in any browser. It needs no snapit, no network and no',
    'installation; everything it shows is in this folder.',
    '',
    'What else is here:',
    ...(hasMedia ? ['  the recording      the capture itself, played by report.html'] : []),
    '  meta.json          when it was captured, on what, and for how long',
    '  network.har        every request, openable in DevTools \u2192 Network',
    '  console.json       what the console said, with timestamps',
    '  actions.json       what was clicked and typed, with timestamps',
    '  generated.spec.ts  a Playwright skeleton of the same steps',
    '',
    'Credentials were stripped before any of this was written.',
    ''
  ].join('\n')
