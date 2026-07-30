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
 * Encode dimensions for a video capture: aimed at `targetLongEdge`, clamped to the source.
 *
 * Two forces meet here. A Retina display hands the recorder ~4x the pixels the user actually
 * sees, and encoding all of them is waste — measured on real screen content, quadrupling the
 * pixel count costs ~2.6x the bitrate at matched quality. But going all the way down to the
 * logical size overshot: a 3024x1964 display is only 1512x982 logical, fewer pixels than the
 * 1920x1080 OBS writes from the same screen, and it showed as softer text.
 *
 * So this scales the logical size *toward* the target in either direction — up for a display
 * whose logical size is below it (drawing on detail the native buffer still holds), down for
 * one above it. It never exceeds the source, so it cannot invent detail.
 *
 * `scale` is device pixels per logical pixel; 1 on non-Retina. `targetLongEdge` comes from the
 * quality preset (see quality.ts).
 */
export function encodeSize(
  srcW: number,
  srcH: number,
  scale: number,
  targetLongEdge: number
): { w: number; h: number } {
  const factor = Number.isFinite(scale) && scale > 1 ? scale : 1
  const logicalW = srcW / factor
  const logicalH = srcH / factor
  const longEdge = Math.max(logicalW, logicalH)
  const target = Number.isFinite(targetLongEdge) && targetLongEdge > 0 ? targetLongEdge : longEdge
  // Clamped at `factor` so the result lands at the source size rather than above it.
  const adjust = longEdge > 0 ? Math.min(target / longEdge, factor) : 1
  return { w: evenFloor(logicalW * adjust), h: evenFloor(logicalH * adjust) }
}
