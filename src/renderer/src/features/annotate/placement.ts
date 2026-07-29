/** A rectangle in overlay-window CSS pixels, matching the codebase's Box/Rect shape. */
export type PlacementRect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }
export type Placement = { left: number; top: number }

/** Breathing room between the anchor and the toolbar. */
const GAP = 8

export type PlaceOptions = {
  /**
   * How to line the toolbar up with its anchor. 'left' matches the anchor's left edge
   * (a capture selection, where the toolbar reads as belonging to the top-left corner);
   * 'center' centres on it (the recording pill, which the toolbar docks under).
   */
  align?: 'left' | 'center'
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/**
 * Where to put an annotation toolbar relative to an anchor — a capture selection, or
 * the draggable recording pill.
 *
 * `area` is the usable **work area**, not the window. The overlay spans the display's
 * full bounds, including the strips behind the macOS Dock and menu bar, so clamping
 * against `window.innerHeight` would happily park the toolbar underneath the Dock.
 *
 * Preference order, matching what Lightshot does: just below the anchor, else just
 * above it, else tucked inside its bottom edge — that last case is an anchor filling
 * the screen, where there is no "outside" left to use. The result is always clamped
 * into `area`, so the toolbar stays reachable however the anchor was placed.
 */
export function placeToolbar(
  sel: PlacementRect,
  toolbar: Size,
  area: PlacementRect,
  { align = 'left' }: PlaceOptions = {}
): Placement {
  const areaBottom = area.y + area.h
  const areaRight = area.x + area.w

  const below = sel.y + sel.h + GAP
  const above = sel.y - GAP - toolbar.h
  const insideBottom = sel.y + sel.h - GAP - toolbar.h

  let top: number
  if (below + toolbar.h <= areaBottom) top = below
  else if (above >= area.y) top = above
  else top = insideBottom

  // Kept fully on screen. If the toolbar is wider than the work area there is nothing
  // to choose between — pin it to the left.
  const maxLeft = Math.max(area.x, areaRight - toolbar.w)
  const maxTop = Math.max(area.y, areaBottom - toolbar.h)
  const anchorLeft = align === 'center' ? sel.x + sel.w / 2 - toolbar.w / 2 : sel.x

  return { left: clamp(anchorLeft, area.x, maxLeft), top: clamp(top, area.y, maxTop) }
}
