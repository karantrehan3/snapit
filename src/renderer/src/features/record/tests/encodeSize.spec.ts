import { describe, it, expect } from 'vitest'
import { encodeSize } from '../encodeSize'

describe('encodeSize', () => {
  it('shrinks a Retina capture well below native', () => {
    const { w, h } = encodeSize(3024, 1964, 2)
    expect(w).toBeLessThan(3024)
    expect(h).toBeLessThan(1964)
  })

  it('does not fall below OBS-grade resolution on a Retina display', () => {
    // Pure logical size here would be 1512x982 — fewer pixels than the 1920x1080 OBS
    // writes from the same screen, which read as visibly softer text.
    const { w } = encodeSize(3024, 1964, 2)
    expect(w).toBe(1920)
  })

  it('keeps the source aspect ratio', () => {
    const { w, h } = encodeSize(3024, 1964, 2)
    expect(w / h).toBeCloseTo(3024 / 1964, 2)
  })

  it('leaves a non-Retina capture at its source size', () => {
    expect(encodeSize(1920, 1080, 1)).toEqual({ w: 1920, h: 1080 })
  })

  it('never upscales past the source, whatever the scale reports', () => {
    for (const scale of [0, 0.5, -2, 1]) {
      const { w, h } = encodeSize(1920, 1080, scale)
      expect(w).toBeLessThanOrEqual(1920)
      expect(h).toBeLessThanOrEqual(1080)
    }
  })

  it('caps the lift at the source size for a capture smaller than the floor', () => {
    // A 1435x903 region at 2x cannot reach a 1920 long edge — it must stop at source.
    const { w, h } = encodeSize(1435, 903, 2)
    expect(w).toBeLessThanOrEqual(1435)
    expect(h).toBeLessThanOrEqual(903)
  })

  it('returns even dimensions so 4:2:0 chroma planes divide cleanly', () => {
    for (const args of [
      [3024, 1964, 2],
      [1435, 903, 2],
      [2560, 1600, 1.5],
      [1131, 707, 2]
    ] as const) {
      const { w, h } = encodeSize(...args)
      expect(w % 2).toBe(0)
      expect(h % 2).toBe(0)
    }
  })

  it('floors degenerate input at an encodable 2x2 rather than zero', () => {
    for (const args of [
      [0, 0, 2],
      [-100, -100, 2],
      [Number.NaN, Number.NaN, 2],
      [1920, 0, 2]
    ] as const) {
      const { w, h } = encodeSize(...args)
      expect(w).toBeGreaterThanOrEqual(2)
      expect(h).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(w)).toBe(true)
      expect(Number.isFinite(h)).toBe(true)
    }
  })
})
