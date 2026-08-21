import { useLayoutEffect, useRef, type ReactElement } from 'react'
import Konva from 'konva'
import { Rect, Ellipse, Line, Arrow, Text, Image as KonvaImage } from 'react-konva'
import type { Box } from '@renderer/lib/image'
import { sourceCropFor } from './redact'
import { REDACT_FILL, type RedactShape, type Shape } from './types'

const SELECT_SHADOW = '#4aa3ff'

/** What every shape node receives: identity, selection glow, drag/select handlers. */
type CommonNodeProps = {
  id: string
  name: string
  draggable: boolean
  onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onDragStart: () => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  shadowColor?: string
  shadowBlur?: number
  shadowOpacity: number
}

/**
 * What a redaction needs beyond the shape itself: the frozen frame to sample, the
 * selection box its coordinates are relative to, and the frame's scale factor.
 * Null on surfaces with no background image (live annotation), where the tool that
 * creates redactions doesn't exist.
 */
export type RenderContext = {
  bg: HTMLImageElement | null
  box: Box
  scaleFactor: number
} | null

export type ShapeHandlers = {
  draggable: boolean
  onSelect: (id: string, e: Konva.KonvaEventObject<MouseEvent>) => void
  onDragStart: () => void
  onDragEnd: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void
  /** Re-open a text shape for editing (double-click). No-op for other shapes. */
  onEditText: (id: string, e: Konva.KonvaEventObject<MouseEvent>) => void
}

/** Render a shape as an interactive Konva node, with a glow when selected. */
export function renderShape(
  shape: Shape,
  selectedId: string | null,
  editingId: string | undefined,
  h: ShapeHandlers,
  ctx: RenderContext = null
): ReactElement {
  const selected = shape.id === selectedId
  const glow = selected
    ? { shadowColor: SELECT_SHADOW, shadowBlur: 10, shadowOpacity: 1 }
    : { shadowOpacity: 0 }

  const common: CommonNodeProps = {
    id: shape.id,
    name: 'shape',
    draggable: h.draggable,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => h.onSelect(shape.id, e),
    onDragStart: h.onDragStart,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => h.onDragEnd(shape.id, e),
    ...glow
  }

  switch (shape.type) {
    case 'rect':
      return (
        <Rect
          key={shape.id}
          {...common}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
        />
      )
    case 'circle':
      return (
        <Ellipse
          key={shape.id}
          {...common}
          x={shape.x + shape.width / 2}
          y={shape.y + shape.height / 2}
          radiusX={Math.abs(shape.width) / 2}
          radiusY={Math.abs(shape.height) / 2}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
        />
      )
    case 'arrow':
      return (
        <Arrow
          key={shape.id}
          {...common}
          x={0}
          y={0}
          points={shape.points}
          stroke={shape.stroke}
          fill={shape.stroke}
          strokeWidth={shape.strokeWidth}
          pointerLength={10}
          pointerWidth={10}
          lineCap="round"
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
        />
      )
    case 'line':
      return (
        <Line
          key={shape.id}
          {...common}
          x={0}
          y={0}
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
        />
      )
    case 'pen':
      return (
        <Line
          key={shape.id}
          {...common}
          x={0}
          y={0}
          points={shape.points}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          hitStrokeWidth={Math.max(shape.strokeWidth, 12)}
        />
      )
    case 'redact':
      return <RedactNode key={shape.id} shape={shape} common={common} ctx={ctx} />
    case 'text':
      return (
        <Text
          key={shape.id}
          {...common}
          x={shape.x}
          y={shape.y}
          text={shape.text}
          fill={shape.fill}
          fontSize={shape.fontSize}
          onDblClick={(e: Konva.KonvaEventObject<MouseEvent>) => h.onEditText(shape.id, e)}
          visible={editingId !== shape.id}
        />
      )
  }
}

/** Discard accidental tiny shapes; text is always kept. */
export function isMeaningful(s: Shape): boolean {
  if (s.type === 'rect' || s.type === 'circle' || s.type === 'redact')
    return Math.abs(s.width) > 3 && Math.abs(s.height) > 3
  if (s.type === 'text') return true
  if (s.type === 'pen') return s.points.length >= 6
  const [x1, y1, x2, y2] = s.points
  return Math.hypot(x2 - x1, y2 - y1) > 4
}

/** Normalize a rect/ellipse drawn with negative width/height to a top-left origin. */
export function normalizeRect(s: Shape): Shape {
  if (s.type !== 'rect' && s.type !== 'circle' && s.type !== 'redact') return s
  const x = s.width < 0 ? s.x + s.width : s.x
  const y = s.height < 0 ? s.y + s.height : s.y
  return { ...s, x, y, width: Math.abs(s.width), height: Math.abs(s.height) }
}

/** Konva's Pixelate divides by pixelSize, so it must never reach zero. */
const MIN_PIXEL_SIZE = 2

/**
 * A redaction. Solid mode is an opaque fill — nothing to sample, nothing to
 * recover. Pixelate mode re-draws the corresponding slice of the frozen frame
 * through Konva's Pixelate filter, which only runs on a cached node.
 */
function RedactNode({
  shape,
  common,
  ctx
}: {
  shape: RedactShape
  common: CommonNodeProps
  ctx: RenderContext
}): ReactElement {
  const ref = useRef<Konva.Image>(null)
  const bg = ctx?.bg ?? null
  const scaleFactor = ctx?.scaleFactor ?? 1
  const crop =
    ctx && bg
      ? sourceCropFor(shape, ctx.box, scaleFactor, { width: bg.naturalWidth, height: bg.naturalHeight })
      : null

  // The filter needs a cache, and it has to exist before the browser paints — an
  // effect that runs after paint would flash one frame of unredacted pixels.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !crop) return
    // Cache at the export pixelRatio (stage.toDataURL uses frame.scaleFactor) so the
    // blocks stay crisp in the saved file instead of being upscaled from a 1x bitmap.
    node.cache({ pixelRatio: scaleFactor })
    return () => void node.clearCache()
  }, [crop?.x, crop?.y, crop?.width, crop?.height, shape.blockSize, scaleFactor, bg])

  // Solid mode, and the fallback whenever there is no frame to sample.
  if (shape.mode === 'solid' || !crop || !bg) {
    return (
      <Rect
        key={shape.id}
        {...common}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={REDACT_FILL}
      />
    )
  }

  return (
    <KonvaImage
      key={shape.id}
      {...common}
      ref={ref}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      image={bg}
      crop={crop}
      filters={[Konva.Filters.Pixelate]}
      // blockSize is in logical pixels but the filter runs on the cached bitmap,
      // so scale it up to keep blocks the same visual size at any scale factor.
      pixelSize={Math.max(MIN_PIXEL_SIZE, Math.round(shape.blockSize * scaleFactor))}
    />
  )
}
