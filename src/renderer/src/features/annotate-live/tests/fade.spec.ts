import { describe, it, expect } from 'vitest'
import { opacityAt, pruneExpired } from '../fade'

const TTL = 1000
const FADE = 200

describe('opacityAt', () => {
  it('stays fully opaque up to and including the TTL', () => {
    expect(opacityAt(0, 0, TTL, FADE)).toBe(1)
    expect(opacityAt(0, 999, TTL, FADE)).toBe(1)
    expect(opacityAt(0, TTL, TTL, FADE)).toBe(1)
  })

  it('fades linearly across the fade window', () => {
    expect(opacityAt(0, TTL + FADE / 2, TTL, FADE)).toBeCloseTo(0.5)
    expect(opacityAt(0, TTL + FADE / 4, TTL, FADE)).toBeCloseTo(0.75)
  })

  it('reaches zero at the end of the fade and stays there', () => {
    expect(opacityAt(0, TTL + FADE, TTL, FADE)).toBe(0)
    expect(opacityAt(0, TTL + FADE * 10, TTL, FADE)).toBe(0)
  })

  it('treats a clock that has not reached bornAt as fresh', () => {
    expect(opacityAt(500, 0, TTL, FADE)).toBe(1)
  })

  it('snaps straight to zero when there is no fade window', () => {
    expect(opacityAt(0, TTL, TTL, 0)).toBe(1)
    expect(opacityAt(0, TTL + 1, TTL, 0)).toBe(0)
  })
})

describe('pruneExpired', () => {
  it('keeps shapes that are still visible', () => {
    const shapes = [{ bornAt: 0 }, { bornAt: 500 }]
    expect(pruneExpired(shapes, TTL, TTL, FADE)).toHaveLength(2)
  })

  it('drops only the fully faded shapes', () => {
    const shapes = [{ bornAt: 0 }, { bornAt: 900 }]
    const kept = pruneExpired(shapes, TTL + FADE, TTL, FADE)
    expect(kept).toEqual([{ bornAt: 900 }])
  })

  it('returns the same array reference when nothing expired', () => {
    const shapes = [{ bornAt: 0 }]
    expect(pruneExpired(shapes, 0, TTL, FADE)).toBe(shapes)
  })

  it('returns a new array when something expired', () => {
    const shapes = [{ bornAt: 0 }]
    const kept = pruneExpired(shapes, TTL + FADE, TTL, FADE)
    expect(kept).not.toBe(shapes)
    expect(kept).toEqual([])
  })
})
