import { describe, it, expect } from 'vitest'
import { toNativeCropRect } from '../region'

describe('toNativeCropRect', () => {
  it('scales a DIP region to native pixels at scaleFactor 1', () => {
    const rect = toNativeCropRect({ x: 10, y: 20, width: 100, height: 50 }, 1, { width: 1000, height: 1000 })
    expect(rect).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('scales a DIP region to native pixels at Retina scaleFactor 2', () => {
    const rect = toNativeCropRect({ x: 10, y: 20, width: 100, height: 50 }, 2, { width: 2000, height: 2000 })
    expect(rect).toEqual({ x: 20, y: 40, width: 200, height: 100 })
  })

  it('rounds fractional pixel results', () => {
    const rect = toNativeCropRect({ x: 1, y: 1, width: 3, height: 3 }, 1.5, { width: 100, height: 100 })
    expect(rect).toEqual({ x: 2, y: 2, width: 5, height: 5 }) // round(1.5), round(4.5)->5 (banker's away-from-zero per Math.round)
  })

  it('clamps a region that overhangs the right/bottom edge', () => {
    const rect = toNativeCropRect({ x: 900, y: 900, width: 200, height: 200 }, 1, {
      width: 1000,
      height: 1000
    })
    expect(rect).toEqual({ x: 900, y: 900, width: 100, height: 100 })
  })

  it('clips a region that starts off the negative edge to the true overlap', () => {
    const rect = toNativeCropRect({ x: -50, y: -50, width: 100, height: 100 }, 1, {
      width: 1000,
      height: 1000
    })
    expect(rect).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('throws for a non-positive width or height', () => {
    expect(() =>
      toNativeCropRect({ x: 0, y: 0, width: 0, height: 10 }, 1, { width: 100, height: 100 })
    ).toThrow(RangeError)
    expect(() =>
      toNativeCropRect({ x: 0, y: 0, width: 10, height: -1 }, 1, { width: 100, height: 100 })
    ).toThrow(RangeError)
  })

  it('throws when the region is entirely outside the display bounds', () => {
    expect(() =>
      toNativeCropRect({ x: 5000, y: 5000, width: 100, height: 100 }, 1, { width: 1000, height: 1000 })
    ).toThrow(RangeError)
  })
})
