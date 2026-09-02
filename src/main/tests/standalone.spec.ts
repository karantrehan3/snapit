import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import {
  MEDIA_PLACEHOLDER,
  SHARE_INLINE_LIMIT_BYTES,
  SHARE_WARN_BYTES,
  base64Length,
  createBase64Encoder,
  dataUri,
  estimatedPackageBytes,
  mimeFor,
  packageFileName,
  packageReadme,
  shareFileName,
  shareTargetName,
  shareVerdict,
  splitOnMedia,
  suggestedShape
} from '../standalone'

describe('createBase64Encoder', () => {
  /** Push a buffer through the encoder in fixed slices and join what comes out. */
  const encodeInChunks = (data: Buffer, size: number): string => {
    const encoder = createBase64Encoder()
    let out = ''
    for (let at = 0; at < data.length; at += size) out += encoder.push(data.subarray(at, at + size))
    return out + encoder.flush()
  }

  it('matches a whole-buffer encode at every awkward chunk size', () => {
    // The failure this guards against is silent: a chunk that does not divide by three
    // pads mid-stream, and every character after it decodes to the wrong bytes.
    const data = randomBytes(5000)
    const expected = data.toString('base64')
    for (const size of [1, 2, 3, 4, 5, 7, 64, 999, 1024, 4096, 5000, 8192]) {
      expect(encodeInChunks(data, size)).toBe(expected)
    }
  })

  it('handles the lengths where padding appears', () => {
    for (const length of [0, 1, 2, 3, 4, 5]) {
      const data = randomBytes(length)
      expect(encodeInChunks(data, 2)).toBe(data.toString('base64'))
    }
  })

  it('emits nothing until it has three bytes to encode', () => {
    const encoder = createBase64Encoder()
    expect(encoder.push(Buffer.from([1]))).toBe('')
    expect(encoder.push(Buffer.from([2]))).toBe('')
    expect(encoder.push(Buffer.from([3]))).toBe(Buffer.from([1, 2, 3]).toString('base64'))
    expect(encoder.flush()).toBe('')
  })

  it('does not hold onto the chunk a remainder came from', () => {
    // The carry is copied out, so a 3 MB chunk is not kept alive by its two spare bytes.
    const encoder = createBase64Encoder()
    const big = randomBytes(3_000_001)
    encoder.push(big)
    expect(encoder.flush()).toBe(big.subarray(3_000_000).toString('base64'))
  })
})

describe('base64Length', () => {
  it('is the exact length, so a size can be known without encoding anything', () => {
    for (const bytes of [0, 1, 2, 3, 4, 100, 999, 1_048_576]) {
      expect(base64Length(bytes)).toBe(randomBytes(bytes).toString('base64').length)
    }
  })

  it('costs a third more than the file it carries', () => {
    expect(base64Length(3 * 1024 * 1024) / (3 * 1024 * 1024)).toBeCloseTo(4 / 3, 5)
  })
})

describe('splitOnMedia', () => {
  it('splits the page around the marker and drops it', () => {
    const { head, tail } = splitOnMedia(`<video src="data:video/mp4;base64,${MEDIA_PLACEHOLDER}">`)
    expect(head).toBe('<video src="data:video/mp4;base64,')
    expect(tail).toBe('">')
  })

  it('refuses a page with nowhere to put the media', () => {
    // Returning it whole would write a video src of the literal marker, which looks
    // right until someone presses play.
    expect(() => splitOnMedia('<p>no media here</p>')).toThrow(/no place to put/)
  })
})

describe('shareVerdict', () => {
  it('passes anything an inbox will take', () => {
    expect(shareVerdict(4 * 1024 * 1024)).toBe('ok')
    expect(shareVerdict(SHARE_WARN_BYTES)).toBe('ok')
  })

  it('warns above the smallest attachment limit anyone actually hits', () => {
    expect(shareVerdict(SHARE_WARN_BYTES + 1)).toBe('large')
    expect(shareVerdict(SHARE_INLINE_LIMIT_BYTES)).toBe('large')
  })

  it('stops inlining where a browser stops opening the page', () => {
    expect(shareVerdict(SHARE_INLINE_LIMIT_BYTES + 1)).toBe('too-large')
  })
})

describe('mimeFor', () => {
  it('names the types a capture can be, with or without the dot', () => {
    expect(mimeFor('mp4')).toBe('video/mp4')
    expect(mimeFor('.PNG')).toBe('image/png')
    expect(mimeFor('har')).toBe('application/json')
  })

  it('refuses to guess, because a wrong type stops a video playing', () => {
    expect(mimeFor('xyz')).toBe('application/octet-stream')
  })
})

describe('dataUri and shareFileName', () => {
  it('builds a URI a browser will decode', () => {
    expect(dataUri('video/mp4', 'AAAA')).toBe('data:video/mp4;base64,AAAA')
  })

  it('names the file after the capture, without doubling the extension', () => {
    expect(shareFileName('snapit-2026-08-25_19-40-17')).toBe('snapit-2026-08-25_19-40-17.html')
    expect(shareFileName('report.html')).toBe('report.html')
  })
})

describe('which shape a capture leaves in', () => {
  const MB = 1024 * 1024

  it('keeps the single file while it is sendable', () => {
    expect(suggestedShape(0)).toBe('file')
    expect(suggestedShape(4 * MB)).toBe('file')
    expect(suggestedShape(SHARE_WARN_BYTES)).toBe('file')
  })

  it('leads with the package once the file stops being sendable', () => {
    // A 33-minute recording is 153 MB on disk and 204 MB as one file. Nothing takes it.
    expect(suggestedShape(SHARE_WARN_BYTES + 1)).toBe('package')
    expect(suggestedShape(204 * MB)).toBe('package')
    expect(suggestedShape(900 * MB)).toBe('package')
  })

  it('names the target after the shape', () => {
    const bundle = 'snapit-2026-08-31_12-48-17'
    expect(shareTargetName(bundle, 'file')).toBe(`${bundle}.html`)
    expect(shareTargetName(bundle, 'report-only')).toBe(`${bundle}.html`)
    expect(shareTargetName(bundle, 'package')).toBe(`${bundle}.zip`)
  })

  it('does not double an extension it already has', () => {
    expect(packageFileName('capture.zip')).toBe('capture.zip')
    expect(packageFileName('capture.html')).toBe('capture.zip')
    expect(shareFileName('capture.html')).toBe('capture.html')
  })

  it('estimates from measured compression, not from assumptions', () => {
    // The measured 160 MB capture: 160,193 kB of media plus 21 kB of text zipped to
    // 146,870 kB. The estimate has to land near that, and never under it.
    const measured = { media: 160_193 * 1024, text: 21 * 1024, actual: 146_863 * 1024 }
    const estimate = estimatedPackageBytes(measured.media, measured.text)
    expect(estimate).toBeGreaterThanOrEqual(measured.actual)
    expect(estimate / measured.actual).toBeLessThan(1.05)
  })

  it('never estimates a package larger than the single file it replaces', () => {
    // If it did, the package would be pointless and the dialog would be lying.
    for (const mb of [1, 25, 150, 500]) {
      const media = mb * MB
      expect(estimatedPackageBytes(media, 900 * 1024)).toBeLessThan(base64Length(media))
    }
  })

  it('takes the text down to about a tenth', () => {
    // report.html and network.har are mostly repeated markup and repeated URLs; both
    // measured between 89% and 95% saved.
    expect(estimatedPackageBytes(0, 1000)).toBe(100)
  })

  it('tells the recipient where to start, and names the media only when there is some', () => {
    const withMedia = packageReadme('snapit-2026-08-31_12-48-17', true)
    expect(withMedia).toContain('Open report.html in any browser')
    expect(withMedia).toContain('the recording')
    expect(withMedia).toContain('network.har')
    // The redaction pass is a promise the recipient should be able to read.
    expect(withMedia).toContain('Credentials were stripped')
    expect(packageReadme('snapit-2026-08-25_14-43-35', false)).not.toContain('the recording')
  })
})
