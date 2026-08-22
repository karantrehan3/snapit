import { describe, it, expect } from 'vitest'
import { bundleLayout, buildMeta, humanBytes, humanDuration, type MetaInput } from '../bundle'
import { captureBaseName } from '../filename'

const SAVE_DIR = '/Users/x/Pictures/snapit'
const BASE = 'snapit-2026-08-22_14-31-07'

const input: MetaInput = {
  capturedAt: new Date('2026-08-22T12:31:07.000Z'),
  appVersion: '3.2.0',
  platform: 'darwin',
  release: '25.5.0',
  arch: 'arm64',
  locale: 'en-GB',
  timeZone: 'Europe/London',
  displays: [],
  durationMs: 64_000,
  hasSystemAudio: true,
  source: { id: 'window:42:0', name: 'Checkout — Chrome', type: 'window' },
  mediaName: `${BASE}.mp4`,
  mediaBytes: 1_572_864,
  ext: 'mp4'
}

describe('bundleLayout', () => {
  it('puts every part of the bundle inside one folder named for the capture', () => {
    const l = bundleLayout(SAVE_DIR, BASE, 'mp4')
    expect(l.dir).toBe(`${SAVE_DIR}/${BASE}`)
    expect(l.metaPath).toBe(`${SAVE_DIR}/${BASE}/meta.json`)
    expect(l.reportPath).toBe(`${SAVE_DIR}/${BASE}/report.html`)
  })

  it('keeps the media named exactly as it would have been as a loose file', () => {
    // The reason for this naming: dragging the mp4 out of the folder still gives
    // you the same file you had before bundles existed.
    const l = bundleLayout(SAVE_DIR, BASE, 'mp4')
    expect(l.mediaName).toBe(`${BASE}.mp4`)
    expect(l.mediaPath).toBe(`${SAVE_DIR}/${BASE}/${BASE}.mp4`)
  })

  it('carries the extension through for gif bundles too', () => {
    expect(bundleLayout(SAVE_DIR, BASE, 'gif').mediaName).toBe(`${BASE}.gif`)
  })

  it('builds its folder name from the same stem as a flat capture file', () => {
    expect(captureBaseName('2026-08-22_14-31-07')).toBe(BASE)
  })
})

describe('buildMeta', () => {
  it('records the capture context a bug report needs', () => {
    const meta = buildMeta(input)
    expect(meta.schema).toBe(1)
    expect(meta.app).toEqual({ name: 'snapit', version: '3.2.0' })
    expect(meta.system.platform).toBe('darwin')
    expect(meta.capture.source?.name).toBe('Checkout — Chrome')
    expect(meta.media).toEqual({ file: `${BASE}.mp4`, bytes: 1_572_864, ext: 'mp4' })
  })

  it('reports an unknown duration rather than a nonsense one when the clock moved', () => {
    expect(buildMeta({ ...input, durationMs: -5000 }).capture.durationMs).toBeNull()
    expect(buildMeta({ ...input, durationMs: null }).capture.durationMs).toBeNull()
  })

  it('survives a recording with no resolvable source', () => {
    expect(buildMeta({ ...input, source: null }).capture.source).toBeNull()
  })
})

describe('humanBytes', () => {
  it('scales through the units', () => {
    expect(humanBytes(512)).toBe('512 B')
    expect(humanBytes(2048)).toBe('2.0 KB')
    expect(humanBytes(1_572_864)).toBe('1.5 MB')
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(humanBytes(48 * 1024 * 1024)).toBe('48 MB')
  })
})

describe('humanDuration', () => {
  it('formats as minutes and padded seconds', () => {
    expect(humanDuration(64_000)).toBe('1:04')
    expect(humanDuration(727_000)).toBe('12:07')
    expect(humanDuration(0)).toBe('0:00')
  })

  it('says so when the duration could not be determined', () => {
    expect(humanDuration(null)).toBe('unknown')
  })
})
