import { describe, it, expect } from 'vitest'
import { isCaptureFile, pickBundleMedia } from '../captures'

describe('isCaptureFile', () => {
  it('accepts the formats snapit writes', () => {
    expect(isCaptureFile('snapit-2026-08-22.png')).toBe(true)
    expect(isCaptureFile('snapit-2026-08-22.mp4')).toBe(true)
    expect(isCaptureFile('snapit-2026-08-22.webm')).toBe(true)
    expect(isCaptureFile('snapit-2026-08-22.gif')).toBe(true)
  })

  it('ignores everything else in the folder', () => {
    expect(isCaptureFile('.DS_Store')).toBe(false)
    expect(isCaptureFile('meta.json')).toBe(false)
    expect(isCaptureFile('report.html')).toBe(false)
    expect(isCaptureFile('notes')).toBe(false)
  })

  it('matches regardless of case', () => {
    expect(isCaptureFile('CLIP.MP4')).toBe(true)
  })
})

describe('pickBundleMedia', () => {
  const BUNDLE = ['snapit-2026-08-22_14-31-07.mp4', 'meta.json', 'report.html']

  it('uses the file the metadata names', () => {
    expect(pickBundleMedia(BUNDLE, 'snapit-2026-08-22_14-31-07.mp4')).toBe('snapit-2026-08-22_14-31-07.mp4')
  })

  it('still finds the recording when the metadata never got written', () => {
    // persistRecording writes the media first and tolerates a failed meta/report
    // write, so this bundle shape is reachable — and hiding the capture would be
    // worse than listing it without its report.
    expect(pickBundleMedia(['snapit-2026-08-22_14-31-07.mp4'], null)).toBe('snapit-2026-08-22_14-31-07.mp4')
  })

  it('falls back to scanning when the metadata names a file that is not there', () => {
    expect(pickBundleMedia(BUNDLE, 'deleted.mp4')).toBe('snapit-2026-08-22_14-31-07.mp4')
  })

  it('refuses a metadata pointer to something that is not a capture', () => {
    expect(pickBundleMedia(BUNDLE, 'meta.json')).toBe('snapit-2026-08-22_14-31-07.mp4')
  })

  it('returns null for a folder that holds no media at all', () => {
    expect(pickBundleMedia(['meta.json', 'report.html'], null)).toBeNull()
    expect(pickBundleMedia([], null)).toBeNull()
  })

  it('picks deterministically when a folder somehow holds more than one', () => {
    const many = ['b.mp4', 'a.mp4']
    expect(pickBundleMedia(many, null)).toBe('a.mp4')
    expect(pickBundleMedia([...many].reverse(), null)).toBe('a.mp4')
  })
})
