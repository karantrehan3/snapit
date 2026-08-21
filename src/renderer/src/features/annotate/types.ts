import type { Box } from '@renderer/lib/image'

// --- Annotation tools & shapes ---

export type Tool = 'move' | 'rect' | 'circle' | 'arrow' | 'line' | 'pen' | 'text' | 'redact'

/**
 * How a redaction hides its region. Solid is the default on purpose: pixelated
 * (and blurred) text can be reconstructed in some cases, an opaque fill cannot.
 */
export type RedactMode = 'solid' | 'pixelate'

type Base = { id: string; stroke: string; strokeWidth: number }

export type RectShape = Base & { type: 'rect'; x: number; y: number; width: number; height: number }
export type CircleShape = Base & { type: 'circle'; x: number; y: number; width: number; height: number }
export type LineShape = Base & { type: 'line' | 'arrow'; points: number[] }
export type PenShape = Base & { type: 'pen'; points: number[] }
export type TextShape = {
  id: string
  type: 'text'
  x: number
  y: number
  text: string
  fill: string
  fontSize: number
}

export type RedactShape = {
  id: string
  type: 'redact'
  x: number
  y: number
  width: number
  height: number
  mode: RedactMode
  blockSize: number
}

export type Shape = RectShape | CircleShape | LineShape | PenShape | TextShape | RedactShape

export const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#1c1c1e']

/** Extended palette for the custom color popover (no native picker needed). */
export const PALETTE = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#dddddd',
  '#ffffff',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0000ff',
  '#ff00ff',
  '#cc0000',
  '#e69138',
  '#f1c232',
  '#6aa84f',
  '#45818e',
  '#3d85c6',
  '#674ea7',
  '#e06666',
  '#f6b26b',
  '#ffd966',
  '#93c47d',
  '#76a5af',
  '#6fa8dc',
  '#8e7cc3'
]

/** Thickness bounds for Cmd+Scroll adjustment, and the starting thickness. */
export const MIN_STROKE = 1
export const MAX_STROKE = 48
export const DEFAULT_STROKE = 4

export const TOOLS: ReadonlyArray<{ tool: Tool; label: string; title: string }> = [
  { tool: 'move', label: '↖', title: 'Move / Select' },
  { tool: 'rect', label: '▭', title: 'Rectangle' },
  { tool: 'circle', label: '◯', title: 'Ellipse' },
  { tool: 'arrow', label: '↗', title: 'Arrow' },
  { tool: 'line', label: '／', title: 'Line' },
  { tool: 'pen', label: '✎', title: 'Pen' },
  { tool: 'text', label: 'T', title: 'Text' },
  { tool: 'redact', label: '▨', title: 'Redact — hide sensitive info' }
]

/** Text font size derived from the selected stroke width. */
export const fontSizeFor = (strokeWidth: number): number => strokeWidth * 4 + 8

/** Font size bounds, derived from the stroke bounds so the two controls agree. */
export const MIN_FONT = fontSizeFor(MIN_STROKE)
export const MAX_FONT = fontSizeFor(MAX_STROKE)

/**
 * Next font size for one ⌘+scroll notch. Steps by 4 so a wheel flick crosses a
 * useful range — a 1px-per-notch font control needs forty turns to be visible.
 */
export const nextFontSize = (current: number, delta: number): number =>
  Math.min(MAX_FONT, Math.max(MIN_FONT, current + delta * 4))

/** Pixelate block size derived from the selected stroke width (mirrors fontSizeFor). */
export const blockSizeFor = (strokeWidth: number): number => strokeWidth * 2 + 6

/**
 * Redactions always paint opaque black rather than the selected colour — a red
 * bar reads as a highlight, i.e. as drawing attention to what it is hiding.
 */
export const REDACT_FILL = '#000000'

export const DEFAULT_REDACT_MODE: RedactMode = 'solid'

export const REDACT_MODES: ReadonlyArray<{ mode: RedactMode; label: string; title: string }> = [
  { mode: 'solid', label: '██', title: 'Solid — the pixels are gone' },
  {
    mode: 'pixelate',
    label: '▩',
    title: 'Pixelate — recoverable in some cases; prefer solid for IDs and card numbers'
  }
]

// --- Editor interaction state ---

export type Pt = { x: number; y: number }
export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export type Editing = {
  id: string
  x: number
  y: number
  value: string
  fontSize: number
  fill: string
  /**
   * True for a box that was just created by clicking with the text tool. Abandoning
   * one of those is a no-op round trip, so its undo snapshot is dropped; emptying an
   * existing label via double-click is a real deletion and stays undoable.
   */
  isNew: boolean
}
/** Whether the ⌘+scroll badge is showing a stroke thickness or a font size. */
export type SizePreviewKind = 'stroke' | 'font'
export type SizePreview = { x: number; y: number; size: number; kind: SizePreviewKind }
export type Drag =
  | { kind: 'create'; start: Pt; prevBox: Box | null }
  | { kind: 'moveBox'; last: Pt }
  | { kind: 'draw' }
