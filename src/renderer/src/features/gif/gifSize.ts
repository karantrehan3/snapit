/** Round down to an even number, floor of 2 — keeps the delta and palette maths tidy. */
function evenFloor(n: number): number {
  if (!Number.isFinite(n)) return 2
  return Math.max(2, Math.floor(n / 2) * 2)
}

/**
 * Encode dimensions for a GIF: the captured area's logical (on-screen) size, capped so the
 * longest edge does not exceed `maxLongEdge`.
 *
 * Unlike the video path this only ever shrinks — it will not scale a small region *up* to
 * reach the cap. GIF has no lossy transform and no motion compensation, so every pixel of
 * every changed region is paid for in full and its size tracks pixel count almost linearly:
 * 1512 wide cost 4240 KB where 1024 cost 1915 KB at near-identical quality. Spending extra
 * bytes to sharpen a region capture nobody asked to sharpen is the wrong trade here, even
 * though it is the right one for MP4.
 *
 * `scale` is device pixels per logical pixel (1 on non-Retina); `maxLongEdge` comes from the
 * quality preset (see quality.ts).
 */
export function gifEncodeSize(
  srcW: number,
  srcH: number,
  scale: number,
  maxLongEdge: number
): { w: number; h: number } {
  const factor = Number.isFinite(scale) && scale > 1 ? scale : 1
  const logicalW = srcW / factor
  const logicalH = srcH / factor
  const longEdge = Math.max(logicalW, logicalH)
  const cap = Number.isFinite(maxLongEdge) && maxLongEdge > 0 ? maxLongEdge : longEdge
  const shrink = longEdge > cap ? cap / longEdge : 1
  return { w: evenFloor(logicalW * shrink), h: evenFloor(logicalH * shrink) }
}
