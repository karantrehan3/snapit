import { describe, it, expect } from 'vitest'
import { targetBitrate } from '../bitrate'

const MIN = 500_000
const MAX = 12_000_000

describe('targetBitrate', () => {
  it('scales with the pixel rate', () => {
    const at30 = targetBitrate(1920, 1080, 30)
    const at60 = targetBitrate(1920, 1080, 60)
    expect(at60).toBe(at30 * 2)
  })

  it('stays within a few times what OBS spends on the same footage', () => {
    // OBS writes 1080p60 screen capture at ~0.66 Mbps. Chromium's constrained-baseline
    // encoder needs more than that, but low single-digit Mbps — not the tens.
    const hd60 = targetBitrate(1920, 1080, 60)
    expect(hd60).toBeGreaterThan(1_000_000)
    expect(hd60).toBeLessThan(3_000_000)
  })

  it('floors tiny region captures', () => {
    expect(targetBitrate(320, 200, 30)).toBe(MIN)
    expect(targetBitrate(1, 1, 1)).toBe(MIN)
  })

  it('caps very large captures', () => {
    expect(targetBitrate(5120, 2880, 120)).toBe(MAX)
    expect(targetBitrate(7680, 4320, 120)).toBe(MAX)
  })

  it('leaves a 4K60 capture under the cap, so the ceiling only catches extremes', () => {
    expect(targetBitrate(3840, 2160, 60)).toBeLessThan(MAX)
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
