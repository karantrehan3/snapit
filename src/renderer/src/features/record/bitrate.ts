/**
 * Bits per pixel per second — a ceiling, not a target; easy screen content spends far
 * less. Calibrated by measurement, and revised twice, so the reasoning is worth keeping:
 *
 * - OBS writes 1080p60 screen capture at 0.46–0.66 Mbps, i.e. ~0.004–0.005 bits per
 *   pixel per second, at a quality users are happy with. That is the bar.
 * - Sweeping this encoder at 1920x1246/30fps against a lossless reference showed SSIM
 *   flat (~0.854) from 406 kbps all the way to 817 kbps, and the delivered bitrate
 *   *saturating* near 810 kbps: asking for 0.015 or 0.020 produced the same file as
 *   0.012. Headroom above ~0.012 buys nothing on ordinary content and only inflates
 *   demanding footage, which is exactly what a real 1920x1246 capture did — it pinned
 *   its 1435 kbps ceiling and produced 1476 kbps, 3.2x what OBS spends.
 *
 * 0.012 sits ~3x OBS's own figure, which is the margin this encoder needs: it is stuck
 * on Chromium's realtime path, so even at High profile it emits no B-frames (OBS's x264
 * uses 2). Drop toward 0.010 for smaller files if quality holds on real footage.
 */
const BITS_PER_PIXEL = 0.012
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
