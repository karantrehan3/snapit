/**
 * Round down to an even number, with a floor of 2. H.264's 4:2:0 chroma planes are
 * half-resolution in both axes, so odd dimensions force the encoder to pad — cheaper
 * to hand it even ones.
 */
function evenFloor(n: number): number {
  if (!Number.isFinite(n)) return 2
  return Math.max(2, Math.floor(n / 2) * 2)
}

/**
 * Encode dimensions for a capture: the source's device pixels scaled back down to its
 * logical (CSS-pixel) size.
 *
 * A Retina display hands the recorder ~4x the pixels the user actually sees, and a
 * screen recording pays for every one of them. Measured on real screen content,
 * quadrupling the pixel count costs ~2.6x the bitrate at matched quality — which is
 * why OBS writes 1080p from the same Retina screens rather than native. Encoding at
 * logical size keeps the result 1:1 with what was on screen (the trade the GIF path
 * already makes — see useGifRecorder) and cuts the per-frame canvas work that was
 * holding full-screen capture below its target frame rate.
 *
 * `scale` is device pixels per logical pixel; values at or below 1 (non-Retina, or a
 * source that already reports logical dimensions) downscale nothing.
 */
export function encodeSize(srcW: number, srcH: number, scale: number): { w: number; h: number } {
  const factor = Number.isFinite(scale) && scale > 1 ? scale : 1
  return { w: evenFloor(srcW / factor), h: evenFloor(srcH / factor) }
}
