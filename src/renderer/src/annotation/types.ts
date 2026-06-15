export type Tool = 'move' | 'rect' | 'arrow' | 'line' | 'pen' | 'text'

type Base = { id: string; stroke: string; strokeWidth: number }

export type RectShape = Base & { type: 'rect'; x: number; y: number; width: number; height: number }
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

export type Shape = RectShape | LineShape | PenShape | TextShape

export const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#1c1c1e']
export const SIZES = [2, 4, 8]

/** Thickness bounds for Cmd+Scroll adjustment. */
export const MIN_STROKE = 1
export const MAX_STROKE = 48

export const TOOLS: ReadonlyArray<{ tool: Tool; label: string; title: string }> = [
  { tool: 'move', label: '↖', title: 'Move / Select' },
  { tool: 'rect', label: '▭', title: 'Rectangle' },
  { tool: 'arrow', label: '↗', title: 'Arrow' },
  { tool: 'line', label: '／', title: 'Line' },
  { tool: 'pen', label: '✎', title: 'Pen' },
  { tool: 'text', label: 'T', title: 'Text' }
]

/** Text font size derived from the selected stroke width. */
export const fontSizeFor = (strokeWidth: number): number => strokeWidth * 4 + 8
