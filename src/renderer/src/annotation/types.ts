export type Tool = 'move' | 'rect' | 'circle' | 'arrow' | 'line' | 'pen' | 'text'

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

export type Shape = RectShape | CircleShape | LineShape | PenShape | TextShape

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
  { tool: 'text', label: 'T', title: 'Text' }
]

/** Text font size derived from the selected stroke width. */
export const fontSizeFor = (strokeWidth: number): number => strokeWidth * 4 + 8
