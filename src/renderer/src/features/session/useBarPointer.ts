import { useEffect, useRef, type RefObject } from 'react'

/**
 * Keeps a floating bar clickable while the rest of the overlay stays out of the way.
 *
 * The overlay spans the whole screen, and during a web capture the screen belongs to
 * the browser being used — so it is click-through except while the pointer is over the
 * bar itself. Same trick the Stop pill uses; this is the version for a bar that does
 * not drag, which is most of the complexity gone.
 */
export function useBarPointer<T extends HTMLElement>(ref: RefObject<T | null>, active: boolean): void {
  // Read inside the listener rather than captured, so a re-render cannot leave the
  // handler pointing at a stale element.
  const latest = useRef(ref)
  latest.current = ref

  useEffect(() => {
    if (!active) return
    window.snapit.setMouseIgnore(true)
    let over = false

    const onMove = (e: MouseEvent): void => {
      const r = latest.current.current?.getBoundingClientRect()
      const isOver =
        !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (isOver === over) return
      over = isOver
      window.snapit.setMouseIgnore(!isOver)
    }

    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      // Leaving the overlay click-through would make the whole screen dead once this
      // bar goes away.
      window.snapit.setMouseIgnore(false)
    }
  }, [active])
}
