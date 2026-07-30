import { describe, it, expect } from 'vitest'
import { encodeSize } from '../encodeSize'
import { QUALITY_PRESETS } from '../quality'

const BALANCED = QUALITY_PRESETS.balanced.videoLongEdge

describe('encodeSize', () => {
  it('shrinks a Retina capture well below native', () => {
    const { w, h } = encodeSize(3024, 1964, 2, BALANCED)
    expect(w).toBeLessThan(3024)
    expect(h).toBeLessThan(1964)
  })

  it('lifts a logical size that sits below the target', () => {
    // 3024x1964 at 2x is only 1512x982 logical — fewer pixels than the 1920x1080 OBS writes
    // from the same screen, which read as visibly softer text.
    expect(encodeSize(3024, 1964, 2, 1920).w).toBe(1920)
  })

  it('shrinks a logical size that sits above the target', () => {
    // Same display, but the 'small' preset wants a smaller frame than logical.
    expect(encodeSize(3024, 1964, 2, 1280).w).toBe(1280)
  })

  it('gives a different frame for each quality preset', () => {
    const widths = (['high', 'balanced', 'small'] as const).map(
      (p) => encodeSize(3024, 1964, 2, QUALITY_PRESETS[p].videoLongEdge).w
    )
    expect(new Set(widths).size).toBe(widths.length)
    expect(widths).toEqual([...widths].sort((a, b) => b - a))
  })

  it('keeps the source aspect ratio', () => {
    const { w, h } = encodeSize(3024, 1964, 2, BALANCED)
    expect(w / h).toBeCloseTo(3024 / 1964, 2)
  })

  it('never exceeds the source, even when the target is far above it', () => {
    const { w, h } = encodeSize(1435, 903, 2, 4096)
    expect(w).toBeLessThanOrEqual(1435)
    expect(h).toBeLessThanOrEqual(903)
  })

  it('leaves a non-Retina capture at its source size when the target is above it', () => {
    expect(encodeSize(1920, 1080, 1, 2560)).toEqual({ w: 1920, h: 1080 })
  })

  it('never upscales, whatever the scale reports', () => {
    for (const scale of [0, 0.5, -2, 1]) {
      const { w, h } = encodeSize(1920, 1080, scale, 2560)
      expect(w).toBeLessThanOrEqual(1920)
      expect(h).toBeLessThanOrEqual(1080)
    }
  })

  it('returns even dimensions so 4:2:0 chroma planes divide cleanly', () => {
    for (const args of [
      [3024, 1964, 2, 1920],
      [1435, 903, 2, 1920],
      [2560, 1600, 1.5, 1280],
      [1131, 707, 2, 2560]
    ] as const) {
      const { w, h } = encodeSize(...args)
      expect(w % 2).toBe(0)
      expect(h % 2).toBe(0)
    }
  })

  it('falls back to the logical size for a nonsensical target', () => {
    for (const target of [0, -100, Number.NaN]) {
      const { w } = encodeSize(3024, 1964, 2, target)
      expect(w).toBe(1512)
    }
  })

  it('floors degenerate input at an encodable 2x2 rather than zero', () => {
    for (const args of [
      [0, 0, 2, 1920],
      [-100, -100, 2, 1920],
      [Number.NaN, Number.NaN, 2, 1920],
      [1920, 0, 2, 1920]
    ] as const) {
      const { w, h } = encodeSize(...args)
      expect(w).toBeGreaterThanOrEqual(2)
      expect(h).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(w)).toBe(true)
      expect(Number.isFinite(h)).toBe(true)
    }
  })
})
