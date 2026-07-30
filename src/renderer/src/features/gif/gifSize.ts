/**
 * Longest edge a GIF is encoded at.
 *
 * GIF has no motion compensation and no lossy transform — every pixel of every changed
 * region is paid for in full — so its size tracks pixel count far more brutally than video.
 * The video path can afford 1920; a GIF at that size is a multi-megabyte file nobody can
 * paste into a chat. Measured on 60 frames of real screen content: 1512 wide produced
 * 4240 KB where 1024 produced 1915 KB at near-identical quality (SSIM 0.9724 vs 0.9657).
 *
 * 1024 keeps UI text legible at 1:1 while landing GIFs in a shareable size class.
 */
const MAX_LONG_EDGE = 1024

/** Round down to an even number, floor of 2 — keeps the delta and palette maths tidy. */
function evenFloor(n: number): number {
  if (!Number.isFinite(n)) return 2
  return Math.max(2, Math.floor(n / 2) * 2)
}

/**
 * Encode dimensions for a GIF: the captured area's logical (on-screen) size, then capped so
 * the longest edge does not exceed MAX_LONG_EDGE. Never upscales — a small region capture
 * stays at its own size rather than being blown up to the cap.
 *
 * `scale` is device pixels per logical pixel (1 on non-Retina displays).
 */
export function gifEncodeSize(srcW: number, srcH: number, scale: number): { w: number; h: number } {
  const factor = Number.isFinite(scale) && scale > 1 ? scale : 1
  const logicalW = srcW / factor
  const logicalH = srcH / factor
  const longEdge = Math.max(logicalW, logicalH)
  const shrink = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1
  return { w: evenFloor(logicalW * shrink), h: evenFloor(logicalH * shrink) }
}
