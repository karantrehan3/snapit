import { targetBitrate } from './bitrate'
import { qualitySettings, type QualityPreset } from './quality'

/** Seconds between key frames. Matches OBS's default; shorter seeks better but costs size. */
export const KEY_FRAME_INTERVAL_SEC = 2

/** AAC bitrate for the mixed mic/system track. */
export const AUDIO_BITRATE = 128_000

/**
 * H.264 levels as `avc1.6400<level_idc hex>` (High profile), with the frame-size cap each
 * one allows, in macroblocks. From H.264 Table A-1 (MaxFS).
 */
const AVC_LEVELS = [
  { level: '28', maxFrameMacroblocks: 8192 }, // 4.0
  { level: '2A', maxFrameMacroblocks: 8704 }, // 4.2
  { level: '32', maxFrameMacroblocks: 22080 }, // 5.0
  { level: '33', maxFrameMacroblocks: 36864 }, // 5.1
  { level: '34', maxFrameMacroblocks: 36864 } // 5.2
] as const

/**
 * Candidate H.264 codec strings for a frame size, lowest sufficient level first — a lower
 * level is more widely decodable, so it is preferred when it fits.
 *
 * The level cap is a real constraint, not a formality: a 1920x1246 frame is 9360
 * macroblocks, which exceeds level 4.2's 8704, and `VideoEncoder.isConfigSupported`
 * duly reports `avc1.64002A` as unsupported at that size. Callers should walk this list
 * and take the first the encoder actually accepts.
 */
export function avcCodecCandidates(width: number, height: number): string[] {
  const mb = Math.ceil(Math.max(1, width) / 16) * Math.ceil(Math.max(1, height) / 16)
  const fits = AVC_LEVELS.filter((l) => l.maxFrameMacroblocks >= mb)
  // Nothing fits (beyond 8K): offer the highest level anyway rather than returning nothing.
  const usable = fits.length > 0 ? fits : [AVC_LEVELS[AVC_LEVELS.length - 1]]
  return usable.map((l) => `avc1.6400${l.level}`)
}

/** A configuration to try, and the per-frame quantizer it needs (null = bitrate-driven). */
export type EncoderPlan = { config: VideoEncoderConfig; quantizer: number | null }

/**
 * Encoder configurations to try, best first, for a given quality preset.
 *
 * Constant-quality is preferred but **cannot be assumed**: `bitrateMode: 'quantizer'` is only
 * implemented by the GPU-backed encoder. On the software path `configure()` still succeeds and
 * then fails *asynchronously* with "Unsupported bitrate mode", closing the codec so every
 * subsequent encode throws — so callers must probe each of these with
 * `VideoEncoder.isConfigSupported` passing the **whole** config. Checking only codec and
 * dimensions reports support that isn't there.
 *
 * Measured at 1920x1246/30fps against a lossless reference: quantizer QP36 gives 677 kbps at
 * SSIM 0.9949, while the software fallback bottoms out near 1012 kbps at 0.9812. Both beat
 * MediaRecorder, which needed 817 kbps for 0.9492 and could do no better at any bitrate.
 */
export function encoderPlans(
  width: number,
  height: number,
  fps: number,
  preset: QualityPreset
): EncoderPlan[] {
  const { quantizer, bitsPerPixel } = qualitySettings(preset)
  const codecs = avcCodecCandidates(width, height)
  const base = { width, height, framerate: fps, avc: { format: 'avc' as const } }
  return [
    // Constant quality: bits follow the content, so a static screen costs almost nothing.
    ...codecs.map((codec) => ({
      config: { ...base, codec, latencyMode: 'quality' as const, bitrateMode: 'quantizer' as const },
      quantizer
    })),
    // Software fallback. Still 'quality' latency — that is what buys the headroom over
    // MediaRecorder, which is pinned to the realtime path.
    ...codecs.map((codec) => ({
      config: {
        ...base,
        codec,
        latencyMode: 'quality' as const,
        bitrateMode: 'variable' as const,
        bitrate: targetBitrate(width, height, fps, bitsPerPixel)
      },
      quantizer: null
    }))
  ]
}
