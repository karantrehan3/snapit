import { describe, it, expect } from 'vitest'
import { MAX_FONT, MAX_STROKE, MIN_FONT, MIN_STROKE, fontSizeFor, nextFontSize } from '../types'

describe('nextFontSize', () => {
  it('steps by 4 in each direction', () => {
    expect(nextFontSize(40, 1)).toBe(44)
    expect(nextFontSize(40, -1)).toBe(36)
  })

  it('clamps to the bounds instead of running away', () => {
    expect(nextFontSize(MAX_FONT, 1)).toBe(MAX_FONT)
    expect(nextFontSize(MIN_FONT, -1)).toBe(MIN_FONT)
  })

  it('stays in range across a long scroll in either direction', () => {
    let up = MIN_FONT
    let down = MAX_FONT
    for (let i = 0; i < 200; i++) {
      up = nextFontSize(up, 1)
      down = nextFontSize(down, -1)
      expect(up).toBeLessThanOrEqual(MAX_FONT)
      expect(down).toBeGreaterThanOrEqual(MIN_FONT)
    }
    expect(up).toBe(MAX_FONT)
    expect(down).toBe(MIN_FONT)
  })

  it('agrees with the stroke-derived bounds, so the two controls share a range', () => {
    expect(MIN_FONT).toBe(fontSizeFor(MIN_STROKE))
    expect(MAX_FONT).toBe(fontSizeFor(MAX_STROKE))
    expect(MIN_FONT).toBeLessThan(MAX_FONT)
  })
})
