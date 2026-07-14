import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Mode, Pt, Rect } from './types'

const normalize = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y)
})

export type RegionSelect = {
  mode: Mode
  setMode: (m: Mode) => void
  box: Rect | null
  /** True when region mode is both selected and available (screen source). */
  regionMode: boolean
  onStageMouseDown: (e: ReactMouseEvent) => void
  onStageMouseMove: (e: ReactMouseEvent) => void
  onStageMouseUp: () => void
}

/**
 * Full/region mode plus the drag-to-select-a-region gesture, shared by the record
 * and gif overlays. Region auto-reverts to full when the selected source isn't a
 * screen (windows can't be region-cropped).
 */
export function useRegionSelect(canRegion: boolean): RegionSelect {
  const [mode, setMode] = useState<Mode>('full')
  const [box, setBox] = useState<Rect | null>(null)
  const dragStart = useRef<Pt | null>(null)

  useEffect(() => {
    if (!canRegion && mode === 'region') setMode('full')
  }, [canRegion, mode])

  const onStageMouseDown = (e: ReactMouseEvent): void => {
    if (mode !== 'region' || e.target !== e.currentTarget) return
    dragStart.current = { x: e.clientX, y: e.clientY }
    setBox({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }
  const onStageMouseMove = (e: ReactMouseEvent): void => {
    if (!dragStart.current) return
    setBox(normalize(dragStart.current, { x: e.clientX, y: e.clientY }))
  }
  const onStageMouseUp = (): void => {
    dragStart.current = null
  }

  return {
    mode,
    setMode,
    box,
    regionMode: mode === 'region' && canRegion,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp
  }
}
