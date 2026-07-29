import type { Shape, TextShape } from '../annotate/types'

/**
 * A shape drawn during a recording, stamped so it can age out on its own. Text is
 * excluded at the type level — `LiveTool` can't produce one, and narrowing here keeps
 * an unreachable branch out of the draft geometry.
 */
export type LiveShape = Exclude<Shape, TextShape> & { bornAt: number }

/**
 * Tools available while recording. Deliberately narrower than the still-image
 * editor's set: no `text` (typing needs keyboard focus on the overlay, which would
 * fight the app being recorded) and no `move` (live annotations are ephemeral, so
 * there is nothing to select or reposition).
 */
export type LiveTool = 'pen' | 'arrow' | 'rect' | 'circle' | 'line'

export const LIVE_TOOLS: ReadonlyArray<{ tool: LiveTool; label: string; title: string }> = [
  { tool: 'pen', label: '✎', title: 'Pen' },
  { tool: 'arrow', label: '↗', title: 'Arrow' },
  { tool: 'rect', label: '▭', title: 'Rectangle' },
  { tool: 'circle', label: '◯', title: 'Ellipse' },
  { tool: 'line', label: '／', title: 'Line' }
]

/**
 * How long a finished annotation stays fully opaque before fading — long enough
 * for a viewer to register it, short enough that it doesn't clutter the recording.
 */
export const SHAPE_TTL_MS = 2500
/** Fade-out duration once the TTL elapses. */
export const FADE_MS = 600
/**
 * Fade ticks per second while shapes are on screen. The fade is 600ms, so 20Hz
 * looks smooth without adding a 60fps React render loop on top of the encoder.
 */
export const FADE_TICK_MS = 50
