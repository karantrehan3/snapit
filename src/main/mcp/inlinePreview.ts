/**
 * Pure sizing helper for MCP tools' optional inline image preview, kept free of
 * electron imports so it can be unit-tested in isolation (mirrors imageFile.ts).
 *
 * Capture-response tools default to returning a file path only — a full-resolution
 * Retina PNG is several MB of base64 and eats a large chunk of the context window.
 * `include_image` opts into an inline preview, downscaled to this width.
 */
export const INLINE_PREVIEW_MAX_WIDTH = 1400

export function previewSize(
  width: number,
  height: number,
  maxWidth = INLINE_PREVIEW_MAX_WIDTH
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height }
  const scale = maxWidth / width
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) }
}
