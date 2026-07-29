import type { Pt } from '../record/types'
import type { LiveShape, LiveTool } from './types'

/** The fields every live shape carries, independent of its geometry. */
export type DraftBase = { id: string; stroke: string; strokeWidth: number; bornAt: number }

/** Start a shape at the pointer. Pure, so the geometry is unit-testable. */
export function createDraft(tool: LiveTool, at: Pt, base: DraftBase): LiveShape {
  switch (tool) {
    case 'pen':
      return { ...base, type: 'pen', points: [at.x, at.y] }
    case 'rect':
    case 'circle':
      return { ...base, type: tool, x: at.x, y: at.y, width: 0, height: 0 }
    case 'arrow':
    case 'line':
      return { ...base, type: tool, points: [at.x, at.y, at.x, at.y] }
  }
}

/**
 * Grow the in-progress shape to follow the pointer. Rect/ellipse keep signed
 * width/height while dragging (normalizeRect fixes the origin on commit) so the
 * shape can be dragged in any direction.
 */
export function extendDraft(draft: LiveShape, at: Pt): LiveShape {
  switch (draft.type) {
    case 'pen':
      return { ...draft, points: [...draft.points, at.x, at.y] }
    case 'rect':
    case 'circle':
      return { ...draft, width: at.x - draft.x, height: at.y - draft.y }
    case 'arrow':
    case 'line':
      return { ...draft, points: [draft.points[0], draft.points[1], at.x, at.y] }
  }
}
