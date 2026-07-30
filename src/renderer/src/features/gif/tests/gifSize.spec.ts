import { describe, it, expect } from 'vitest'
import { gifEncodeSize } from '../gifSize'
import { QUALITY_PRESETS } from '../../record/quality'

const BALANCED = QUALITY_PRESETS.balanced.gifLongEdge

describe('gifEncodeSize', () => {
  it('caps a full-screen Retina capture at the long edge', () => {
    // 3024x1964 at 2x is 1512x982 logical, which exceeds the balanced cap.
    const { w, h } = gifEncodeSize(3024, 1964, 2, BALANCED)
    expect(Math.max(w, h)).toBe(BALANCED)
  })

  it('keeps the source aspect ratio when capping', () => {
    const { w, h } = gifEncodeSize(3024, 1964, 2, BALANCED)
    expect(w / h).toBeCloseTo(3024 / 1964, 2)
  })

  it('gives a different frame for each quality preset', () => {
    const widths = (['high', 'balanced', 'small'] as const).map(
      (p) => gifEncodeSize(3024, 1964, 2, QUALITY_PRESETS[p].gifLongEdge).w
    )
    expect(new Set(widths).size).toBe(widths.length)
    expect(widths).toEqual([...widths].sort((a, b) => b - a))
  })

  it('does NOT lift a capture that is already under the cap', () => {
    // The deliberate difference from the video path: GIF size tracks pixel count almost
    // linearly, so sharpening a small region nobody asked to sharpen is the wrong trade.
    expect(gifEncodeSize(650, 1362, 2, BALANCED)).toEqual({ w: 324, h: 680 })
  })

  it('never upscales a small capture toward the cap', () => {
    const { w, h } = gifEncodeSize(400, 300, 2, BALANCED)
    expect(w).toBeLessThanOrEqual(200)
    expect(h).toBeLessThanOrEqual(150)
  })

  it('caps on the long edge for a tall capture, not the width', () => {
    const { w, h } = gifEncodeSize(800, 2400, 1, BALANCED)
    expect(h).toBe(BALANCED)
    expect(w).toBeLessThan(400)
  })

  it('treats a non-Retina capture as already logical', () => {
    expect(gifEncodeSize(900, 600, 1, BALANCED)).toEqual({ w: 900, h: 600 })
  })

  it('ignores a nonsensical scale rather than upscaling', () => {
    for (const scale of [0, 0.5, -2, Number.NaN]) {
      const { w, h } = gifEncodeSize(900, 600, scale, BALANCED)
      expect(w).toBe(900)
      expect(h).toBe(600)
    }
  })

  it('falls back to the logical size for a nonsensical cap', () => {
    for (const cap of [0, -100, Number.NaN]) {
      expect(gifEncodeSize(3024, 1964, 2, cap).w).toBe(1512)
    }
  })

  it('returns even dimensions', () => {
    for (const args of [
      [3024, 1964, 2, 1024],
      [1435, 903, 2, 720],
      [1131, 707, 2, 1280]
    ] as const) {
      const { w, h } = gifEncodeSize(...args)
      expect(w % 2).toBe(0)
      expect(h % 2).toBe(0)
    }
  })

  it('floors degenerate input at an encodable 2x2', () => {
    for (const args of [
      [0, 0, 2, 1024],
      [-100, -100, 2, 1024],
      [Number.NaN, Number.NaN, 2, 1024]
    ] as const) {
      const { w, h } = gifEncodeSize(...args)
      expect(w).toBeGreaterThanOrEqual(2)
      expect(h).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(w)).toBe(true)
      expect(Number.isFinite(h)).toBe(true)
    }
  })
})
