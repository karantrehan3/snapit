/**
 * Pure geometry helpers for MCP region capture, kept free of electron imports
 * so they can be unit-tested in isolation (mirrors imageFile.ts / updateResolve.ts).
 */

export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

/**
 * Convert a region given in a display's logical points (DIP — what `list_displays`
 * reports) into the pixel rect to crop from that display's native-resolution
 * capture, clamped to the image bounds so an out-of-range request degrades to
 * "whatever overlaps" instead of throwing deep inside `nativeImage.crop`.
 */
export function toNativeCropRect(region: Rect, scaleFactor: number, image: Size): Rect {
  if (region.width <= 0 || region.height <= 0) {
    throw new RangeError('Region width and height must be positive')
  }
  const scaledX = Math.round(region.x * scaleFactor)
  const scaledY = Math.round(region.y * scaleFactor)
  const scaledWidth = Math.round(region.width * scaleFactor)
  const scaledHeight = Math.round(region.height * scaleFactor)

  // Intersect [scaledX, scaledX + scaledWidth) with [0, image.width) — checked before
  // clamping the origin, else an origin already past the far edge would clamp to a
  // false 1px sliver instead of correctly reporting no overlap at all.
  const overlapsX = scaledX < image.width && scaledX + scaledWidth > 0
  const overlapsY = scaledY < image.height && scaledY + scaledHeight > 0
  if (!overlapsX || !overlapsY) {
    throw new RangeError('Region is entirely outside the display bounds')
  }

  const x = Math.max(scaledX, 0)
  const y = Math.max(scaledY, 0)
  const width = Math.min(scaledX + scaledWidth, image.width) - x
  const height = Math.min(scaledY + scaledHeight, image.height) - y
  return { x, y, width, height }
}
