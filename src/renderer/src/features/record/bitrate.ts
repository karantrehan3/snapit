/**
 * Bits per pixel per second.
 *
 * Calibrated against OBS rather than guessed: OBS writes 1080p60 screen capture at
 * 0.54–0.66 Mbps, or ~0.005 bits per pixel per second, at a quality users are happy
 * with. It gets there with x264 High profile — CABAC and B-frames — which measured
 * ~2.5x more efficient than the constrained-baseline realtime encoder Chromium hands
 * MediaRecorder. So matching that quality here needs roughly 0.013; this rounds up to
 * 0.02 for headroom on high-motion content, and remains a ceiling rather than a
 * target — static screen content spends far less.
 *
 * The previous 0.1 was ~7.5x above what this encoder needs, which is most of why
 * snapit's files dwarfed OBS's for the same footage.
 */
const BITS_PER_PIXEL = 0.02
/** Floor, so a small region crop still gets a usable bitrate. */
const MIN_BITRATE = 500_000
/** Ceiling, so a 4K60 capture can't ask for a bitrate no share target wants. */
const MAX_BITRATE = 12_000_000

/**
 * Target video bitrate in bits per second, from the encode dimensions and frame rate.
 *
 * MediaRecorder exposes no CRF or quality setting — only a target bitrate — so this
 * derives one from the pixel rate instead of leaving Chromium's internal resolution
 * heuristic to guess. Note what this *doesn't* do: Chromium still encodes on its
 * real-time path (no B-frames, short keyframe interval, no rate-distortion search),
 * so this only stops the default from mis-spending. Matching a CRF encoder needs
 * encoding outside MediaRecorder entirely.
 */
export function targetBitrate(width: number, height: number, fps: number): number {
  const pixelRate = Math.max(0, width) * Math.max(0, height) * Math.max(1, fps)
  const raw = Math.round(pixelRate * BITS_PER_PIXEL)
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw))
}
