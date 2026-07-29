import { useCallback, useRef, useState, type RefObject } from 'react'
import type Konva from 'konva'
import type { AnnotationOptions } from '../record/types'
import { useLiveAnnotations, type LiveAnnotations } from './useLiveAnnotations'

export type LiveSurface = {
  /** True while the user is actively drawing on the recording. */
  drawMode: boolean
  /** Pass to the recording pill; undefined when this source can't be annotated. */
  onToggleDraw: (() => void) | undefined
  anno: LiveAnnotations
  /** The Konva layer whose canvas the recorder blits into each frame. */
  layerRef: RefObject<Konva.Layer | null>
  /** Feed straight into useRecorder / useGifRecorder. */
  options: AnnotationOptions
}

/**
 * The annotate-while-recording state both the video and GIF overlays need.
 *
 * Extracted because they wired this up identically — a fix to annotation behaviour
 * should not have to be applied twice. Placement of the toolbar lives in
 * RecordingChrome instead, since it has to measure the (draggable) pill, which the
 * recorder owns and is therefore created after this.
 *
 * `canAnnotate` should be the source picker's `canRegion`: annotations only map onto the
 * frame 1:1 when the captured source is the display this overlay covers.
 */
export function useLiveSurface(canAnnotate: boolean): LiveSurface {
  const [drawMode, setDrawMode] = useState(false)

  const layerRef = useRef<Konva.Layer | null>(null)
  const getAnnotationCanvas = useCallback(
    (): HTMLCanvasElement | null => layerRef.current?.getNativeCanvasElement() ?? null,
    []
  )
  const exitDraw = useCallback(() => setDrawMode(false), [])

  // drawMode can only be switched on from the recording pill, so it doubles as the
  // "is a recording in progress" gate.
  const anno = useLiveAnnotations(drawMode, exitDraw)

  return {
    drawMode,
    onToggleDraw: canAnnotate ? () => setDrawMode((v) => !v) : undefined,
    anno,
    layerRef,
    options: { drawMode, getAnnotationCanvas }
  }
}
