import { describe, it, expect } from 'vitest'
import { annotationCrop } from '../composite'

const SCREEN_W = 1440
const SCREEN_H = 900

describe('annotationCrop', () => {
  it('covers the whole screen when there is no region box', () => {
    expect(annotationCrop(null, SCREEN_W, SCREEN_H, SCREEN_W, SCREEN_H, 1)).toEqual({
      sx: 0,
      sy: 0,
      sw: SCREEN_W,
      sh: SCREEN_H,
      dw: SCREEN_W,
      dh: SCREEN_H
    })
  })

  it('crops to the region box in logical pixels', () => {
    const crop = annotationCrop({ x: 100, y: 50, w: 400, h: 300 }, SCREEN_W, SCREEN_H, 400, 300, 1)
    expect(crop).toEqual({ sx: 100, sy: 50, sw: 400, sh: 300, dw: 400, dh: 300 })
  })

  it('scales the source crop by the annotation canvas pixel ratio, not the destination', () => {
    const crop = annotationCrop({ x: 100, y: 50, w: 400, h: 300 }, SCREEN_W, SCREEN_H, 400, 300, 2)
    expect(crop).toEqual({ sx: 200, sy: 100, sw: 800, sh: 600, dw: 400, dh: 300 })
  })

  it('maps a logical region onto a native-sized destination (region video at 2x)', () => {
    const crop = annotationCrop({ x: 0, y: 0, w: 400, h: 300 }, SCREEN_W, SCREEN_H, 800, 600, 2)
    expect(crop.sw).toBe(800)
    expect(crop.dw).toBe(800)
    expect(crop.dh).toBe(600)
  })

  it('clamps a box that runs off the right/bottom edge', () => {
    const crop = annotationCrop({ x: 1400, y: 880, w: 400, h: 300 }, SCREEN_W, SCREEN_H, 400, 300, 1)
    expect(crop.sx).toBe(1400)
    expect(crop.sw).toBe(40)
    expect(crop.sy).toBe(880)
    expect(crop.sh).toBe(20)
  })

  it('clamps a negative origin back onto the screen', () => {
    const crop = annotationCrop({ x: -50, y: -20, w: 200, h: 100 }, SCREEN_W, SCREEN_H, 200, 100, 1)
    expect(crop.sx).toBe(0)
    expect(crop.sy).toBe(0)
  })

  it('never produces a zero or negative source size', () => {
    const crop = annotationCrop({ x: 10, y: 10, w: 0, h: -5 }, SCREEN_W, SCREEN_H, 10, 10, 1)
    expect(crop.sw).toBe(1)
    expect(crop.sh).toBe(1)
  })
})
