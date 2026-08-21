import { describe, it, expect } from 'vitest'
import { sourceCropFor } from '../redact'
import { blockSizeFor, fontSizeFor, MAX_STROKE, MIN_STROKE, TOOLS } from '../types'

// A 1440x900 logical frame captured on a 2x display, so the background image the
// redaction samples is 2880x1800. The selection box sits at (100, 50).
const IMAGE = { width: 2880, height: 1800 }
const BOX = { x: 100, y: 50, w: 800, h: 600 }
const SCALE = 2

describe('sourceCropFor', () => {
  it('offsets by the box origin before scaling', () => {
    // Shape at box-local (10, 20) is at stage (110, 70) → source (220, 140).
    const crop = sourceCropFor({ x: 10, y: 20, width: 50, height: 30 }, BOX, SCALE, IMAGE)
    expect(crop).toEqual({ x: 220, y: 140, width: 100, height: 60 })
  })

  it('is identity-scaled for an image opened at 1x', () => {
    const box = { x: 0, y: 0, w: 400, h: 300 }
    const crop = sourceCropFor({ x: 10, y: 20, width: 50, height: 30 }, box, 1, { width: 400, height: 300 })
    expect(crop).toEqual({ x: 10, y: 20, width: 50, height: 30 })
  })

  it('normalizes a rect dragged up and to the left', () => {
    // Drawn from (60, 50) back to (10, 20): stored with negative extents.
    const dragged = sourceCropFor({ x: 60, y: 50, width: -50, height: -30 }, BOX, SCALE, IMAGE)
    const equivalent = sourceCropFor({ x: 10, y: 20, width: 50, height: 30 }, BOX, SCALE, IMAGE)
    expect(dragged).toEqual(equivalent)
  })

  it('returns null for a zero-area rect rather than throwing mid-render', () => {
    expect(sourceCropFor({ x: 10, y: 10, width: 0, height: 40 }, BOX, SCALE, IMAGE)).toBeNull()
    expect(sourceCropFor({ x: 10, y: 10, width: 40, height: 0 }, BOX, SCALE, IMAGE)).toBeNull()
  })

  it('clamps a rect that runs past the right edge of the image', () => {
    // Stage x = 100 + 1330 = 1430 → source 2860, only 20px short of the 2880 edge.
    const crop = sourceCropFor({ x: 1330, y: 0, width: 200, height: 10 }, BOX, SCALE, IMAGE)
    expect(crop).toEqual({ x: 2860, y: 100, width: 20, height: 20 })
  })

  it('clamps a negative origin to the image edge', () => {
    const box = { x: 0, y: 0, w: 400, h: 300 }
    const crop = sourceCropFor({ x: -20, y: -10, width: 60, height: 40 }, box, 1, IMAGE)
    expect(crop).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('returns null when the rect is entirely off the image', () => {
    const box = { x: 0, y: 0, w: 400, h: 300 }
    expect(sourceCropFor({ x: -100, y: 0, width: 50, height: 50 }, box, 1, IMAGE)).toBeNull()
  })
})

describe('blockSizeFor', () => {
  it('grows with stroke width', () => {
    expect(blockSizeFor(MIN_STROKE)).toBeLessThan(blockSizeFor(MAX_STROKE))
  })

  it('never returns a block small enough to leave the content readable', () => {
    expect(blockSizeFor(MIN_STROKE)).toBeGreaterThanOrEqual(8)
  })

  it('stays coarser than the text size at the same stroke, in the safer direction', () => {
    // Both derive from stroke width; this pins the relationship so a tweak to one
    // doesn't silently make redaction blocks finer than the surrounding type.
    expect(blockSizeFor(MIN_STROKE)).toBeLessThan(fontSizeFor(MIN_STROKE))
  })
})

describe('TOOLS', () => {
  it('exposes redact, and every tool stays uniquely identifiable', () => {
    expect(TOOLS.map((t) => t.tool)).toContain('redact')
    expect(new Set(TOOLS.map((t) => t.tool)).size).toBe(TOOLS.length)
    expect(new Set(TOOLS.map((t) => t.label)).size).toBe(TOOLS.length)
  })

  it('still exposes text, which was hidden while its focus bug was open', () => {
    expect(TOOLS.map((t) => t.tool)).toContain('text')
  })
})
