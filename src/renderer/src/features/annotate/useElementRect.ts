import { useLayoutEffect, useState, type RefObject } from 'react'
import type { PlacementRect } from './placement'

/**
 * Track an element's on-screen rect so other chrome can anchor to it.
 *
 * Used to dock the draw-mode toolbar under the recording pill: the pill is draggable,
 * so its position isn't derivable from props — it has to be measured. Re-measures after
 * every render (a drag re-renders) and bails when unchanged, which is what stops it
 * looping.
 */
export function useElementRect(ref: RefObject<HTMLElement | null>, enabled: boolean): PlacementRect | null {
  const [rect, setRect] = useState<PlacementRect | null>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setRect((prev) => (prev === null ? prev : null))
      return
    }
    const el = ref.current
    if (!el) return
    const { x, y, width, height } = el.getBoundingClientRect()
    if (width === 0 && height === 0) return
    setRect((prev) =>
      prev && prev.x === x && prev.y === y && prev.w === width && prev.h === height
        ? prev
        : { x, y, w: width, h: height }
    )
  })

  return rect
}
