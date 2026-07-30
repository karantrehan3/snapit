import { describe, it, expect } from 'vitest'
import { createGifWriter } from '../gifWriter'
import { QUALITY_PRESETS } from '../../record/quality'

const TOL = QUALITY_PRESETS.balanced.gifTolerance

const W = 64
const H = 48

/** A frame of one flat colour, plus some structure so the palette has something to work with. */
function frame(r: number, g: number, b: number, stripe = 0): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const onStripe = stripe > 0 && Math.floor(i / W) % stripe === 0
    px[i * 4] = onStripe ? 255 - r : r
    px[i * 4 + 1] = onStripe ? 255 - g : g
    px[i * 4 + 2] = onStripe ? 255 - b : b
    px[i * 4 + 3] = 255
  }
  return px
}

/** Shift every channel by `d` — used to probe the unchanged-pixel tolerance. */
function nudged(src: Uint8ClampedArray, d: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src)
  for (let i = 0; i < out.length; i += 4) {
    out[i] += d
    out[i + 1] += d
    out[i + 2] += d
  }
  return out
}

describe('createGifWriter', () => {
  it('encodes a single frame into a GIF', () => {
    const w = createGifWriter(W, H, TOL)
    w.addFrame(frame(200, 40, 40, 4), 40)
    const bytes = w.finish()
    expect(w.frameCount()).toBe(1)
    expect(bytes.length).toBeGreaterThan(0)
    // GIF89a magic.
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
  })

  it('counts every frame added', () => {
    const w = createGifWriter(W, H, TOL)
    for (let i = 0; i < 5; i++) w.addFrame(frame(10 + i * 20, 60, 90, 4), 40)
    expect(w.frameCount()).toBe(5)
    w.finish()
  })

  it('spends almost nothing on a frame identical to the last', () => {
    const base = frame(120, 160, 200, 4)
    const still = createGifWriter(W, H, TOL)
    still.addFrame(base, 40)
    const afterFirst = still.finish().length

    const repeated = createGifWriter(W, H, TOL)
    repeated.addFrame(base, 40)
    repeated.addFrame(base, 40)
    const afterRepeat = repeated.finish().length

    // The second, unchanged frame must cost far less than the first cost outright.
    expect(afterRepeat - afterFirst).toBeLessThan(afterFirst)
  })

  it('costs more for a frame that changes completely than one that does not', () => {
    const base = frame(120, 160, 200, 4)
    const same = createGifWriter(W, H, TOL)
    same.addFrame(base, 40)
    same.addFrame(base, 40)

    const changed = createGifWriter(W, H, TOL)
    changed.addFrame(base, 40)
    changed.addFrame(frame(20, 240, 60, 3), 40)

    expect(changed.finish().length).toBeGreaterThan(same.finish().length)
  })

  it('treats a sub-tolerance shift as unchanged, so it stays cheap', () => {
    const base = frame(120, 160, 200, 4)
    const tiny = createGifWriter(W, H, TOL)
    tiny.addFrame(base, 40)
    tiny.addFrame(nudged(base, 4), 40)

    const big = createGifWriter(W, H, TOL)
    big.addFrame(base, 40)
    big.addFrame(nudged(base, 90), 40)

    expect(tiny.finish().length).toBeLessThan(big.finish().length)
  })

  it('accepts a frame backed by a view into a larger buffer', () => {
    // getImageData hands back a view; a naive `new Uint32Array(rgba.buffer)` would misread
    // one with a non-zero byteOffset.
    const backing = new Uint8ClampedArray(W * H * 4 + 128)
    const view = backing.subarray(64, 64 + W * H * 4)
    view.set(frame(90, 90, 90, 6))
    const w = createGifWriter(W, H, TOL)
    expect(() => w.addFrame(view, 40)).not.toThrow()
    expect(w.finish().length).toBeGreaterThan(0)
  })

  it('writes less when the tolerance is wider, which is the size lever presets use', () => {
    const base = frame(120, 160, 200, 4)
    // A shift of 16 counts as unchanged at the 'small' tolerance but not at 'high'.
    const shifted = nudged(base, 16)

    const strict = createGifWriter(W, H, QUALITY_PRESETS.high.gifTolerance)
    strict.addFrame(base, 40)
    strict.addFrame(shifted, 40)

    const loose = createGifWriter(W, H, QUALITY_PRESETS.small.gifTolerance)
    loose.addFrame(base, 40)
    loose.addFrame(shifted, 40)

    expect(loose.finish().length).toBeLessThan(strict.finish().length)
  })

  it('treats a zero tolerance as "any change counts", not as "ignore everything"', () => {
    const base = frame(120, 160, 200, 4)
    const w = createGifWriter(W, H, 0)
    w.addFrame(base, 40)
    w.addFrame(nudged(base, 30), 40)
    expect(w.frameCount()).toBe(2)
    expect(w.finish().length).toBeGreaterThan(0)
  })
})
