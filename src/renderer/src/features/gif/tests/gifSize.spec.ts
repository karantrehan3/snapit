import { describe, it, expect } from 'vitest'
import { gifEncodeSize } from '../gifSize'

describe('gifEncodeSize', () => {
  it('caps a full-screen Retina capture at the long edge', () => {
    // 3024x1964 at 2x is 1512x982 logical, which exceeds the 1024 cap.
    const { w, h } = gifEncodeSize(3024, 1964, 2)
    expect(Math.max(w, h)).toBe(1024)
  })

  it('keeps the source aspect ratio when capping', () => {
    const { w, h } = gifEncodeSize(3024, 1964, 2)
    expect(w / h).toBeCloseTo(3024 / 1964, 2)
  })

  it('leaves a capture already under the cap at its logical size', () => {
    // A 650x1362 region at 2x is 325x681 logical — both edges under the cap.
    expect(gifEncodeSize(650, 1362, 2)).toEqual({ w: 324, h: 680 })
  })

  it('never upscales a small capture to the cap', () => {
    const { w, h } = gifEncodeSize(400, 300, 2)
    expect(w).toBeLessThanOrEqual(200)
    expect(h).toBeLessThanOrEqual(150)
  })

  it('caps on the long edge for a tall capture, not the width', () => {
    // 800x2400 logical: height is the long edge and must come down to 1024.
    const { w, h } = gifEncodeSize(800, 2400, 1)
    expect(h).toBe(1024)
    expect(w).toBeLessThan(400)
  })

  it('treats a non-Retina capture as already logical', () => {
    expect(gifEncodeSize(900, 600, 1)).toEqual({ w: 900, h: 600 })
  })

  it('ignores a nonsensical scale rather than upscaling', () => {
    for (const scale of [0, 0.5, -2, Number.NaN]) {
      const { w, h } = gifEncodeSize(900, 600, scale)
      expect(w).toBe(900)
      expect(h).toBe(600)
    }
  })

  it('floors degenerate input at an encodable 2x2', () => {
    for (const args of [
      [0, 0, 2],
      [-100, -100, 2],
      [Number.NaN, Number.NaN, 2]
    ] as const) {
      const { w, h } = gifEncodeSize(...args)
      expect(w).toBeGreaterThanOrEqual(2)
      expect(h).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(w)).toBe(true)
      expect(Number.isFinite(h)).toBe(true)
    }
  })
})
