import type { Box } from '@renderer/lib/image'

/** A rectangle in the background image's own pixel space. */
export type SourceRect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }
/** A rectangle in selection-box-local coordinates, as shapes are stored. */
export type LocalRect = { x: number; y: number; width: number; height: number }

/**
 * Convert a redaction's box-local rect into the pixel rect to crop from the
 * native-resolution background image.
 *
 * Mirrors main/mcp/region.ts:toNativeCropRect, with two deliberate differences:
 * shape coordinates are relative to the selection box (so the box origin is added
 * before scaling), and a rect with no overlap returns null rather than throwing —
 * this runs inside render, where a throw would take the whole overlay down.
 */
export function sourceCropFor(
  rect: LocalRect,
  box: Box,
  scaleFactor: number,
  image: Size
): SourceRect | null {
  // Drafts are drawn with negative extents until the pointer is released.
  const left = rect.width < 0 ? rect.x + rect.width : rect.x
  const top = rect.height < 0 ? rect.y + rect.height : rect.y
  const w = Math.abs(rect.width)
  const h = Math.abs(rect.height)
  if (w <= 0 || h <= 0) return null

  const scaledX = Math.round((box.x + left) * scaleFactor)
  const scaledY = Math.round((box.y + top) * scaleFactor)
  const scaledWidth = Math.round(w * scaleFactor)
  const scaledHeight = Math.round(h * scaleFactor)

  const x = Math.max(scaledX, 0)
  const y = Math.max(scaledY, 0)
  const width = Math.min(scaledX + scaledWidth, image.width) - x
  const height = Math.min(scaledY + scaledHeight, image.height) - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}
