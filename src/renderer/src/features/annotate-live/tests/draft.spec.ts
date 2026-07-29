import { describe, it, expect } from 'vitest'
import { createDraft, extendDraft, type DraftBase } from '../draft'

const base: DraftBase = { id: 'live-0', stroke: '#ff3b30', strokeWidth: 4, bornAt: 1000 }

describe('createDraft', () => {
  it('starts a pen stroke with a single point', () => {
    const d = createDraft('pen', { x: 10, y: 20 }, base)
    expect(d).toMatchObject({ type: 'pen', points: [10, 20] })
  })

  it('starts rect and ellipse with zero size at the pointer', () => {
    for (const tool of ['rect', 'circle'] as const) {
      expect(createDraft(tool, { x: 5, y: 6 }, base)).toMatchObject({
        type: tool,
        x: 5,
        y: 6,
        width: 0,
        height: 0
      })
    }
  })

  it('starts arrow and line as a degenerate two-point segment', () => {
    for (const tool of ['arrow', 'line'] as const) {
      expect(createDraft(tool, { x: 7, y: 8 }, base)).toMatchObject({
        type: tool,
        points: [7, 8, 7, 8]
      })
    }
  })

  it('carries the shared base fields through', () => {
    expect(createDraft('pen', { x: 0, y: 0 }, base)).toMatchObject(base)
  })
})

describe('extendDraft', () => {
  it('appends to a pen stroke', () => {
    const start = createDraft('pen', { x: 0, y: 0 }, base)
    const next = extendDraft(extendDraft(start, { x: 1, y: 2 }), { x: 3, y: 4 })
    expect(next).toMatchObject({ points: [0, 0, 1, 2, 3, 4] })
  })

  it('keeps signed width/height so a rect can be dragged up and left', () => {
    const start = createDraft('rect', { x: 100, y: 100 }, base)
    expect(extendDraft(start, { x: 60, y: 70 })).toMatchObject({
      x: 100,
      y: 100,
      width: -40,
      height: -30
    })
  })

  it('moves only the end point of a line, keeping the anchor', () => {
    const start = createDraft('line', { x: 10, y: 10 }, base)
    const next = extendDraft(extendDraft(start, { x: 50, y: 50 }), { x: 99, y: 1 })
    expect(next).toMatchObject({ points: [10, 10, 99, 1] })
  })

  it('does not mutate the shape it was given', () => {
    const start = createDraft('pen', { x: 0, y: 0 }, base)
    const snapshot = structuredClone(start)
    extendDraft(start, { x: 5, y: 5 })
    expect(start).toEqual(snapshot)
  })
})
