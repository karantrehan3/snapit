import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { placeToolbar, type PlaceOptions, type PlacementRect, type Size } from './placement'

/**
 * Starting size, used only for the very first layout pass. Roughly the real toolbar so
 * that even if a measurement never lands the position is sane. The previous code
 * hard-coded a 420px width forever, which silently went stale as the toolbar grew.
 */
const ESTIMATE: Size = { w: 560, h: 44 }

export type ToolbarPlacement = {
  /** Attach to the toolbar's root element so it can be measured. */
  barRef: RefObject<HTMLDivElement | null>
  style: CSSProperties
}

/**
 * Position an annotation toolbar relative to a selection, kept inside the usable work
 * area. Measures the real toolbar rather than assuming a width, so adding a control
 * can't push it off screen.
 */
export function useToolbarPlacement(
  sel: PlacementRect | null,
  area: PlacementRect,
  opts?: PlaceOptions
): ToolbarPlacement {
  const barRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>(ESTIMATE)

  // A layout effect (not useEffect) so the corrected position is committed before the
  // browser paints — the estimate never becomes visible. Runs after every render and
  // bails when unchanged, which is what keeps it from looping.
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
  })

  return {
    barRef,
    style: sel ? placeToolbar(sel, size, area, opts) : { visibility: 'hidden' }
  }
}
