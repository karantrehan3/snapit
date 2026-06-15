import type { ReactElement } from 'react'
import { Rect, Line, Arrow, Text } from 'react-konva'
import type { Shape } from './types'

const SELECT_SHADOW = '#4aa3ff'

/** Render a shape as a Konva node, with a glow when selected. */
export function renderShape(shape: Shape, selectedId: string | null, editingId?: string): ReactElement {
  const selected = shape.id === selectedId
  const glow = selected
    ? { shadowColor: SELECT_SHADOW, shadowBlur: 10, shadowOpacity: 1 }
    : { shadowOpacity: 0 }

  switch (shape.type) {
    case 'rect':
      return (
        <Rect
          key={shape.id}
          id={shape.id}
          name="shape"
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
          {...glow}
        />
      )
    case 'arrow':
      return (
        <Arrow
          key={shape.id}
          id={shape.id}
          name="shape"
          points={shape.points}
          stroke={shape.stroke}
          fill={shape.stroke}
          strokeWidth={shape.strokeWidth}
          pointerLength={10}
          pointerWidth={10}
          lineCap="round"
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
          {...glow}
        />
      )
    case 'line':
      return (
        <Line
          key={shape.id}
          id={shape.id}
          name="shape"
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
          {...glow}
        />
      )
    case 'pen':
      return (
        <Line
          key={shape.id}
          id={shape.id}
          name="shape"
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
          {...glow}
        />
      )
    case 'text':
      return (
        <Text
          key={shape.id}
          id={shape.id}
          name="shape"
          x={shape.x}
          y={shape.y}
          text={shape.text}
          fill={shape.fill}
          fontSize={shape.fontSize}
          visible={editingId !== shape.id}
          {...glow}
        />
      )
  }
}

/** Discard accidental tiny shapes; text is always kept. */
export function isMeaningful(s: Shape): boolean {
  if (s.type === 'rect') return Math.abs(s.width) > 3 && Math.abs(s.height) > 3
  if (s.type === 'text') return true
  if (s.type === 'pen') return s.points.length >= 6
  const [x1, y1, x2, y2] = s.points
  return Math.hypot(x2 - x1, y2 - y1) > 4
}

/** Normalize a rect drawn with negative width/height to a top-left origin. */
export function normalizeRect(s: Shape): Shape {
  if (s.type !== 'rect') return s
  const x = s.width < 0 ? s.x + s.width : s.x
  const y = s.height < 0 ? s.y + s.height : s.y
  return { ...s, x, y, width: Math.abs(s.width), height: Math.abs(s.height) }
}

/** Translate a shape by (dx, dy) in its local coordinate space. */
export function moveShape(s: Shape, dx: number, dy: number): Shape {
  if (s.type === 'rect' || s.type === 'text') return { ...s, x: s.x + dx, y: s.y + dy }
  return { ...s, points: s.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
}
