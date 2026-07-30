import { describe, it, expect } from 'vitest'
import { targetBitrate } from '../bitrate'
import { QUALITY_PRESETS } from '../quality'

const MIN = 500_000
const MAX = 12_000_000
const BPP = QUALITY_PRESETS.balanced.bitsPerPixel

describe('targetBitrate', () => {
  it('scales with the pixel rate', () => {
    const at30 = targetBitrate(1920, 1080, 30, BPP)
    const at60 = targetBitrate(1920, 1080, 60, BPP)
    expect(at60).toBe(at30 * 2)
  })

  it('scales with the quality preset’s bits per pixel', () => {
    const lean = targetBitrate(1920, 1080, 60, QUALITY_PRESETS.small.bitsPerPixel)
    const rich = targetBitrate(1920, 1080, 60, QUALITY_PRESETS.high.bitsPerPixel)
    expect(rich).toBeGreaterThan(lean)
  })

  it('stays within a few times what OBS spends on the same footage', () => {
    // OBS writes 1080p60 screen capture at ~0.66 Mbps. Chromium's fallback encoder needs
    // more than that, but low single-digit Mbps — not the tens.
    const hd60 = targetBitrate(1920, 1080, 60, BPP)
    expect(hd60).toBeGreaterThan(1_000_000)
    expect(hd60).toBeLessThan(3_000_000)
  })

  it('floors tiny region captures', () => {
    expect(targetBitrate(320, 200, 30, BPP)).toBe(MIN)
    expect(targetBitrate(1, 1, 1, BPP)).toBe(MIN)
  })

  it('caps very large captures', () => {
    expect(targetBitrate(5120, 2880, 120, BPP)).toBe(MAX)
    expect(targetBitrate(7680, 4320, 120, BPP)).toBe(MAX)
  })

  it('leaves a 4K60 capture under the cap, so the ceiling only catches extremes', () => {
    expect(targetBitrate(3840, 2160, 60, BPP)).toBeLessThan(MAX)
  })

  it('never returns a non-positive or non-finite bitrate for degenerate input', () => {
    for (const args of [
      [0, 0, 0, BPP],
      [-100, -100, -5, BPP],
      [1920, 0, 30, BPP],
      [1920, 1080, 30, -1]
    ] as const) {
      const bps = targetBitrate(...args)
      expect(Number.isFinite(bps)).toBe(true)
      expect(bps).toBeGreaterThanOrEqual(MIN)
    }
  })

  it('treats a zero frame rate as one frame per second rather than zero bits', () => {
    expect(targetBitrate(1920, 1080, 0, BPP)).toBe(targetBitrate(1920, 1080, 1, BPP))
  })
})
