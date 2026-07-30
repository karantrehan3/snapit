import { describe, it, expect } from 'vitest'
import { avcCodecCandidates, encoderPlans, VIDEO_QUANTIZER, KEY_FRAME_INTERVAL_SEC } from '../encoderConfig'

describe('avcCodecCandidates', () => {
  it('offers level 4.0 first for a frame that fits it', () => {
    // 1280x720 = 80x45 = 3600 macroblocks, well inside level 4.0's 8192.
    expect(avcCodecCandidates(1280, 720)[0]).toBe('avc1.640028')
  })

  it('skips levels too small for the frame', () => {
    // 1920x1246 = 120x78 = 9360 macroblocks: past 4.0 (8192) and 4.2 (8704).
    const candidates = avcCodecCandidates(1920, 1246)
    expect(candidates).not.toContain('avc1.640028')
    expect(candidates).not.toContain('avc1.64002A')
    expect(candidates[0]).toBe('avc1.640032')
  })

  it('keeps 1080p on level 4.0, which it just fits', () => {
    // 1920x1080 = 120x68 (rounded up) = 8160 macroblocks, under 8192.
    expect(avcCodecCandidates(1920, 1080)[0]).toBe('avc1.640028')
  })

  it('offers higher levels as fallbacks, in ascending order', () => {
    const candidates = avcCodecCandidates(1280, 720)
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates).toEqual([...candidates].sort())
  })

  it('still returns a codec for a frame beyond every level', () => {
    const candidates = avcCodecCandidates(15360, 8640)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0]).toMatch(/^avc1\.6400/)
  })

  it('never returns an empty list for degenerate sizes', () => {
    for (const [w, h] of [
      [0, 0],
      [-10, -10],
      [1, 1]
    ]) {
      expect(avcCodecCandidates(w, h).length).toBeGreaterThan(0)
    }
  })
})

describe('encoderPlans', () => {
  const plans = encoderPlans(1920, 1246, 30)

  it('prefers constant quality, then falls back to a bitrate target', () => {
    expect(plans[0].config.bitrateMode).toBe('quantizer')
    expect(plans[0].quantizer).toBe(VIDEO_QUANTIZER)
    const fallback = plans.find((p) => p.config.bitrateMode === 'variable')
    expect(fallback).toBeDefined()
    expect(fallback?.quantizer).toBeNull()
  })

  it('every quantizer plan comes before every bitrate plan', () => {
    const lastQuantizer = plans.findLastIndex((p) => p.config.bitrateMode === 'quantizer')
    const firstVariable = plans.findIndex((p) => p.config.bitrateMode === 'variable')
    expect(lastQuantizer).toBeLessThan(firstVariable)
  })

  it('asks for the quality latency mode throughout — that is the gain over MediaRecorder', () => {
    expect(plans.every((p) => p.config.latencyMode === 'quality')).toBe(true)
  })

  it('gives every bitrate plan a positive target', () => {
    for (const plan of plans.filter((p) => p.quantizer === null)) {
      expect(plan.config.bitrate).toBeGreaterThan(0)
    }
  })

  it('only offers codecs whose level fits the frame', () => {
    // 1920x1246 exceeds level 4.2, so no plan may name a level below 5.0.
    expect(plans.some((p) => p.config.codec === 'avc1.640028')).toBe(false)
    expect(plans.some((p) => p.config.codec === 'avc1.64002A')).toBe(false)
  })

  it('carries the dimensions and frame rate into every plan', () => {
    for (const plan of plans) {
      expect(plan.config.width).toBe(1920)
      expect(plan.config.height).toBe(1246)
      expect(plan.config.framerate).toBe(30)
    }
  })
})

describe('encoder constants', () => {
  it('keeps the quantizer in H.264 range and in the useful part of it', () => {
    expect(VIDEO_QUANTIZER).toBeGreaterThanOrEqual(20)
    expect(VIDEO_QUANTIZER).toBeLessThanOrEqual(45)
  })

  it('matches OBS default key frame interval', () => {
    expect(KEY_FRAME_INTERVAL_SEC).toBe(2)
  })
})
