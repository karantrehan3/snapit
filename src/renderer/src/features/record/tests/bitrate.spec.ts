import { describe, it, expect } from 'vitest'
import { targetBitrate } from '../bitrate'

const MIN = 800_000
const MAX = 40_000_000

describe('targetBitrate', () => {
  it('scales with the pixel rate', () => {
    const at30 = targetBitrate(1920, 1080, 30)
    const at60 = targetBitrate(1920, 1080, 60)
    expect(at60).toBe(at30 * 2)
  })

  it('lands in a sane range for common screen resolutions', () => {
    // 1080p30 screen capture — single-digit Mbps, not the tens.
    const hd = targetBitrate(1920, 1080, 30)
    expect(hd).toBeGreaterThan(4_000_000)
    expect(hd).toBeLessThan(10_000_000)
  })

  it('floors tiny region captures', () => {
    expect(targetBitrate(320, 200, 30)).toBe(MIN)
    expect(targetBitrate(1, 1, 1)).toBe(MIN)
  })

  it('caps very large captures', () => {
    expect(targetBitrate(3840, 2160, 60)).toBe(MAX)
    expect(targetBitrate(7680, 4320, 120)).toBe(MAX)
  })

  it('never returns a non-positive or non-finite bitrate for degenerate input', () => {
    for (const args of [
      [0, 0, 0],
      [-100, -100, -5],
      [1920, 0, 30]
    ] as const) {
      const bps = targetBitrate(...args)
      expect(Number.isFinite(bps)).toBe(true)
      expect(bps).toBeGreaterThanOrEqual(MIN)
    }
  })

  it('treats a zero frame rate as one frame per second rather than zero bits', () => {
    expect(targetBitrate(1920, 1080, 0)).toBe(targetBitrate(1920, 1080, 1))
  })
})
