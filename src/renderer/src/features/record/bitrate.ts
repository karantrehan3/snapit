/**
 * Floor, so a small region crop still gets a usable bitrate.
 */
const MIN_BITRATE = 500_000
/** Ceiling, so a 4K60 capture can't ask for a bitrate no share target wants. */
const MAX_BITRATE = 12_000_000

/**
 * Target video bitrate in bits per second, from the encode dimensions, frame rate and the
 * quality preset's bits-per-pixel figure.
 *
 * This is only reached when the platform has no constant-quality (quantizer) mode, which
 * means no GPU-backed encoder. It is a ceiling rather than a target: measured at
 * 1920x1246/30fps the encoder saturated near 810 kbps and ignored anything above ~0.012
 * bits/px/s, while OBS achieves its quality at ~0.004-0.005 with an encoder that has B-frames
 * — which Chromium's realtime path does not. See quality.ts for the per-preset values.
 */
export function targetBitrate(width: number, height: number, fps: number, bitsPerPixel: number): number {
  const pixelRate = Math.max(0, width) * Math.max(0, height) * Math.max(1, fps)
  const raw = Math.round(pixelRate * Math.max(0, bitsPerPixel))
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw))
}
