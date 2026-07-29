/**
 * Bits per pixel per second. Screen UI compresses far better than camera video, but
 * punishes under-allocation harder (text goes mushy before motion does), so this sits
 * below a camera-tuned figure (~0.2) while staying well clear of text artefacts.
 */
const BITS_PER_PIXEL = 0.1
/** Floor, so a small region crop still gets a usable bitrate. */
const MIN_BITRATE = 800_000
/** Ceiling, so a 4K60 capture can't ask for a bitrate no share target wants. */
const MAX_BITRATE = 40_000_000

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
