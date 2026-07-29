import { describe, it, expect } from 'vitest'
import { encodeSize } from '../encodeSize'

describe('encodeSize', () => {
  it('halves Retina device pixels back to logical size', () => {
    expect(encodeSize(3024, 1890, 2)).toEqual({ w: 1512, h: 944 })
  })

  it('leaves a non-Retina capture at its source size', () => {
    expect(encodeSize(1920, 1080, 1)).toEqual({ w: 1920, h: 1080 })
  })

  it('never upscales, whatever the scale reports', () => {
    for (const scale of [0, 0.5, -2]) {
      const { w, h } = encodeSize(1920, 1080, scale)
      expect(w).toBe(1920)
      expect(h).toBe(1080)
    }
  })

  it('returns even dimensions so 4:2:0 chroma planes divide cleanly', () => {
    // 1435/2 = 717.5 and 903/2 = 451.5 — both would round to odd.
    const { w, h } = encodeSize(1435, 903, 2)
    expect(w % 2).toBe(0)
    expect(h % 2).toBe(0)
  })

  it('handles a fractional scale factor', () => {
    expect(encodeSize(2560, 1600, 1.5)).toEqual({ w: 1706, h: 1066 })
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
