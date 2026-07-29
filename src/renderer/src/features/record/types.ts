import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

export type Phase = 'setup' | 'recording'
export type Mode = 'full' | 'region'
export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

/** Annotation wiring both recorders take, so the video and GIF paths can't drift. */
export type AnnotationOptions = {
  /** Whether annotation draw mode is on — drives overlay click-through. */
  drawMode: boolean
  /** The live annotation layer's canvas, or null when there's nothing to burn in. */
  getAnnotationCanvas: () => HTMLCanvasElement | null
}

/**
 * The subset of a recorder that the on-screen recording chrome needs. Both `Recorder`
 * and `GifRecorder` satisfy this structurally, which is what lets one chrome component
 * serve both overlays.
 */
export type RecordingChromeSource = {
  elapsed: number
  saving: boolean
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onPillMouseDown: (e: ReactMouseEvent) => void
  stop: () => void
}

/** Everything the recorder needs to start a capture. */
export type RecordParams = {
  selectedId: string
  systemAudio: boolean
  mic: boolean
  fps: number
  regionMode: boolean
  box: Rect | null
  /**
   * Whether this source *can* be annotated — true when it's the display the overlay
   * covers, false for a window or second-display capture (screen-space annotations
   * wouldn't map onto those frames).
   *
   * When true, full-screen routes through the canvas from the start so the pencil is
   * available at any point during the recording: MediaRecorder can't swap its video
   * track after start(), so the route can't be added on demand. When false, the cheaper
   * zero-copy track path is used, since no annotation will be offered anyway.
   */
  annotatable: boolean
  fallbackWidth: number
  fallbackHeight: number
}
