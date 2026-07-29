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
 * Longest edge we will shrink an encode down to. OBS records these same Retina screens
 * at 1920x1080, and that is the quality bar — going below it trades away detail no
 * bitrate can buy back.
 *
 * This exists because encoding at pure logical size overshot: a 3024x1964 display has a
 * logical size of only 1512x982, *fewer* pixels than OBS writes, and it showed as
 * softer text and flatter colour. The colour part is not a tagging bug — downscaling
 * resamples gamma-encoded sRGB non-linearly, which dims fine detail and flattens
 * apparent saturation, so the less we downscale the less of it we get.
 */
const MIN_LONG_EDGE = 1920

/**
 * Encode dimensions for a capture: the source's device pixels scaled down toward its
 * logical (CSS-pixel) size, but never below OBS-grade resolution.
 *
 * A Retina display hands the recorder ~4x the pixels the user actually sees, and a
 * screen recording pays for every one of them — measured on real screen content,
 * quadrupling the pixel count costs ~2.6x the bitrate at matched quality. So the win is
 * in not encoding native; it is not in going all the way down to logical.
 *
 * `scale` is device pixels per logical pixel; values at or below 1 (non-Retina, or a
 * source that already reports logical dimensions) downscale nothing. The result never
 * exceeds the source — this only ever shrinks.
 */
export function encodeSize(srcW: number, srcH: number, scale: number): { w: number; h: number } {
  const factor = Number.isFinite(scale) && scale > 1 ? scale : 1
  const logicalW = srcW / factor
  const logicalH = srcH / factor
  const longEdge = Math.max(logicalW, logicalH)
  // Give back just enough of the downscale to clear the floor, capped at `factor` so
  // the result lands at the source size rather than above it.
  const lift = longEdge > 0 && longEdge < MIN_LONG_EDGE ? Math.min(MIN_LONG_EDGE / longEdge, factor) : 1
  return { w: evenFloor(logicalW * lift), h: evenFloor(logicalH * lift) }
}
