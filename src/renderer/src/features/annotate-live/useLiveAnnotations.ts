import { useCallback, useEffect, useRef, useState } from 'react'
import { isMeaningful, normalizeRect } from '../annotate/shapes'
import { COLORS, DEFAULT_STROKE } from '../annotate/types'
import { pruneExpired } from './fade'
import { createDraft, extendDraft } from './draft'
import { FADE_TICK_MS, type LiveShape, type LiveTool } from './types'

export type LiveAnnotations = {
  tool: LiveTool
  setTool: (t: LiveTool) => void
  color: string
  setColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (w: number) => void
  shapes: LiveShape[]
  draft: LiveShape | null
  now: number
  clear: () => void
}

/**
 * Draw-only annotation state for use *during* a recording.
 *
 * Deliberately far smaller than useAnnotationEditor: no undo/redo, no selection,
 * no transformer. Shapes commit on mouse-up, fade out on their own, and are never
 * editable again. That keeps the Konva layer pure geometry — which matters,
 * because that layer's canvas is blitted straight into the recording, so anything
 * interactive on it (selection glow, resize handles) would be burned into the file.
 */
export function useLiveAnnotations(enabled: boolean, onExit: () => void): LiveAnnotations {
  const [tool, setTool] = useState<LiveTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE)
  const [shapes, setShapes] = useState<LiveShape[]>([])
  const [draft, setDraft] = useState<LiveShape | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const idRef = useRef(0)
  // Mirrors `draft` so a commit uses the newest geometry rather than whatever the
  // last render happened to capture.
  const draftRef = useRef<LiveShape | null>(null)

  const setBoth = useCallback((next: LiveShape | null): void => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const clear = useCallback((): void => {
    setShapes([])
    setBoth(null)
  }, [setBoth])

  const commit = useCallback((): void => {
    const d = draftRef.current
    setBoth(null)
    if (!d) return
    // normalizeRect spreads its input, so bornAt survives the round-trip.
    const finished = normalizeRect(d) as LiveShape
    if (!isMeaningful(finished)) return
    // Stamp the TTL from when the stroke *finished* — a slow pen stroke would
    // otherwise begin fading before the user lifted the mouse.
    setShapes((prev) => [...prev, { ...finished, bornAt: Date.now() }])
  }, [setBoth])

  // Age shapes out. Ticks only while something is on screen (see FADE_TICK_MS).
  useEffect(() => {
    if (shapes.length === 0) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      setShapes((prev) => pruneExpired(prev, t))
    }, FADE_TICK_MS)
    return () => window.clearInterval(id)
  }, [shapes.length])

  // Leaving draw mode discards everything — live annotations are per-moment, and a
  // stale shape reappearing on the next toggle would land in the recording.
  useEffect(() => {
    if (!enabled) clear()
  }, [enabled, clear])

  /**
   * Pointer handling lives on `window` rather than on the Konva stage: a stroke
   * that starts on the canvas but is released over the tool strip still has to
   * commit, and the stage is pinned at `inset: 0` at 1:1 CSS scale, so client
   * coordinates already are stage coordinates. Chrome (`[data-no-draw]`) is
   * excluded so clicking a button doesn't start a stroke underneath it.
   */
  useEffect(() => {
    if (!enabled) return
    const onDown = (e: MouseEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[data-no-draw]')) return
      setBoth(
        createDraft(
          tool,
          { x: e.clientX, y: e.clientY },
          { id: `live-${idRef.current++}`, stroke: color, strokeWidth, bornAt: Date.now() }
        )
      )
    }
    const onMove = (e: MouseEvent): void => {
      const d = draftRef.current
      if (d) setBoth(extendDraft(d, { x: e.clientX, y: e.clientY }))
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', commit)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', commit)
    }
  }, [enabled, tool, color, strokeWidth, setBoth, commit])

  // Escape and Backspace belong to draw mode while it's on: Escape clears if there
  // is anything to clear, otherwise leaves draw mode. The recorders skip Escape in
  // draw mode so this can never end the recording by accident.
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Backspace') {
        clear()
        return
      }
      if (e.key !== 'Escape') return
      if (draftRef.current || shapes.length > 0) clear()
      else onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, shapes.length, clear, onExit])

  return {
    tool,
    setTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    shapes,
    draft,
    now,
    clear
  }
}
