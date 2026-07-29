import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { Phase, Pt } from './types'

export type RecordingPointer = {
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onPillMouseDown: (e: ReactMouseEvent) => void
}

/**
 * Pointer plumbing shared by the video and GIF recorders while recording.
 *
 * The overlay spans the whole screen, so it stays click-through for the screen to
 * remain usable — except over the draggable Stop pill, where it briefly captures
 * events. In draw mode the overlay captures everything instead, so annotations can
 * be drawn on it; the trade-off is that the app underneath can't be clicked until
 * draw mode is switched off again.
 */
export function useRecordingPointer(phase: Phase, drawMode: boolean): RecordingPointer {
  const [pillPos, setPillPos] = useState<Pt | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const pillDrag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (phase !== 'recording') return
    window.snapit.setMouseIgnore(!drawMode)
    let over = false

    const hitPill = (e: MouseEvent): boolean => {
      const r = pillRef.current?.getBoundingClientRect()
      return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    }

    const onMove = (e: MouseEvent): void => {
      if (pillDrag.current) {
        window.snapit.setMouseIgnore(false)
        setPillPos({ x: e.clientX - pillDrag.current.dx, y: e.clientY - pillDrag.current.dy })
        return
      }
      // Draw mode already receives every event; hover toggling would fight it.
      if (drawMode) return
      const isOver = hitPill(e)
      if (isOver !== over) {
        over = isOver
        window.snapit.setMouseIgnore(!isOver)
      }
    }

    const onUp = (e: MouseEvent): void => {
      if (!pillDrag.current) return
      pillDrag.current = null
      if (drawMode) return
      // Re-sync from the drop position. Dragging holds click-through off while it
      // runs but leaves `over` stale at false, so without this a drag that ends off
      // the pill would match `isOver === over` on every later move and never restore
      // click-through — leaving the whole screen unclickable mid-recording.
      over = hitPill(e)
      window.snapit.setMouseIgnore(!over)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.snapit.setMouseIgnore(false)
    }
  }, [phase, drawMode])

  const onPillMouseDown = (e: ReactMouseEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return // let the Stop button click through
    const r = pillRef.current?.getBoundingClientRect()
    if (!r) return
    pillDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.preventDefault()
  }

  return { pillPos, pillRef, onPillMouseDown }
}
