import type { Frame } from '@preload/index'
import type { Box } from '@renderer/lib/image'
import type { Corner, Pt } from './types'

export const MIN_BOX = 6

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

export const inBox = (p: Pt, b: Box): boolean =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

export function clampBox(b: Box, frame: Frame): Box {
  return {
    ...b,
    x: clamp(b.x, 0, Math.max(0, frame.width - b.w)),
    y: clamp(b.y, 0, Math.max(0, frame.height - b.h))
  }
}

/** Resize a box by dragging one corner, clamped to a min size and the screen. */
export function resizeBox(b: Box, corner: Corner, dx: number, dy: number, frame: Frame): Box {
  const right = b.x + b.w
  const bottom = b.y + b.h
  let { x, y, w, h } = b
  if (corner === 'nw' || corner === 'sw') {
    const left = clamp(b.x + dx, 0, right - MIN_BOX)
    x = left
    w = right - left
  } else {
    w = clamp(right + dx, b.x + MIN_BOX, frame.width) - b.x
  }
  if (corner === 'nw' || corner === 'ne') {
    const topEdge = clamp(b.y + dy, 0, bottom - MIN_BOX)
    y = topEdge
    h = bottom - topEdge
  } else {
    h = clamp(bottom + dy, b.y + MIN_BOX, frame.height) - b.y
  }
  return { x, y, w, h }
}
