import { describe, it, expect } from 'vitest'
import {
  DEFAULT_QUALITY,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  qualitySettings,
  type QualityPreset
} from '../quality'

const ordered = QUALITY_ORDER.map((p) => QUALITY_PRESETS[p])

describe('quality presets', () => {
  it('defaults to balanced', () => {
    expect(DEFAULT_QUALITY).toBe('balanced')
  })

  it('lists every preset exactly once, best first', () => {
    expect([...QUALITY_ORDER].sort()).toEqual(Object.keys(QUALITY_PRESETS).sort())
    expect(QUALITY_ORDER[0]).toBe('high')
    expect(QUALITY_ORDER[QUALITY_ORDER.length - 1]).toBe('small')
  })

  it('raises the quantizer as quality drops — higher QP means smaller and coarser', () => {
    const qps = ordered.map((s) => s.quantizer)
    expect(qps).toEqual([...qps].sort((a, b) => a - b))
    expect(new Set(qps).size).toBe(qps.length)
  })

  it('keeps every quantizer inside H.264 range and in the useful part of it', () => {
    for (const s of ordered) {
      expect(s.quantizer).toBeGreaterThanOrEqual(18)
      expect(s.quantizer).toBeLessThanOrEqual(45)
    }
  })

  it('lowers the bitrate ceiling as quality drops', () => {
    const bpp = ordered.map((s) => s.bitsPerPixel)
    expect(bpp).toEqual([...bpp].sort((a, b) => b - a))
  })

  it('lowers both long-edge targets as quality drops', () => {
    const video = ordered.map((s) => s.videoLongEdge)
    const gif = ordered.map((s) => s.gifLongEdge)
    expect(video).toEqual([...video].sort((a, b) => b - a))
    expect(gif).toEqual([...gif].sort((a, b) => b - a))
  })

  it('always targets a smaller frame for GIF than for MP4', () => {
    // GIF size tracks pixel count far more brutally, so it cannot share video's target.
    for (const s of ordered) expect(s.gifLongEdge).toBeLessThan(s.videoLongEdge)
  })

  it('widens the GIF tolerance as quality drops', () => {
    const tol = ordered.map((s) => s.gifTolerance)
    expect(tol).toEqual([...tol].sort((a, b) => a - b))
  })

  it('keeps the GIF tolerance below the point where quality measurably fell away', () => {
    // Measured: SSIM is flat to tol 18 and starts dropping by 20; 24 is the deliberate
    // trade for the 'small' preset only.
    for (const s of ordered) expect(s.gifTolerance).toBeLessThanOrEqual(24)
  })

  it('gives every preset a label and a hint for the UI', () => {
    for (const s of ordered) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.hint.length).toBeGreaterThan(0)
    }
  })

  it('resolves a known preset to its own settings', () => {
    expect(qualitySettings('small')).toBe(QUALITY_PRESETS.small)
  })

  it('falls back to the default for an unrecognised preset', () => {
    expect(qualitySettings('nonsense' as QualityPreset)).toBe(QUALITY_PRESETS[DEFAULT_QUALITY])
  })
})
