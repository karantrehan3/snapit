import { describe, it, expect } from 'vitest'
import { placeToolbar, type PlacementRect } from '../placement'

// A 1440x900 logical display with a 25px macOS menu bar and a 70px Dock. The overlay
// window spans the whole 1440x900; only this inset rectangle is actually usable.
const AREA: PlacementRect = { x: 0, y: 25, w: 1440, h: 805 }
const AREA_BOTTOM = AREA.y + AREA.h // 830
const BAR = { w: 560, h: 44 }
const GAP = 8

describe('placeToolbar', () => {
  it('sits just below a selection when there is room', () => {
    const p = placeToolbar({ x: 100, y: 100, w: 400, h: 300 }, BAR, AREA)
    expect(p).toEqual({ left: 100, top: 408 })
  })

  it('flips above rather than hiding behind the Dock', () => {
    // Selection ends at y=800. Below would be 808, which fits inside the 900px window
    // but overlaps the Dock (starts at 830) — the bug this function exists to prevent.
    const p = placeToolbar({ x: 0, y: 100, w: 1440, h: 700 }, BAR, AREA)
    expect(p.top).toBe(100 - GAP - BAR.h)
    expect(p.top + BAR.h).toBeLessThanOrEqual(AREA_BOTTOM)
  })

  it('tucks inside the selection when it fills the screen', () => {
    const p = placeToolbar({ x: 0, y: 0, w: 1440, h: 900 }, BAR, AREA)
    expect(p.top).toBe(AREA_BOTTOM - BAR.h)
    expect(p.top).toBeGreaterThanOrEqual(AREA.y)
  })

  it('never places the toolbar under the menu bar', () => {
    // Selection pinned to the very top: above would be negative.
    const p = placeToolbar({ x: 0, y: 0, w: 300, h: 200 }, BAR, AREA)
    expect(p.top).toBeGreaterThanOrEqual(AREA.y)
  })

  it('stays fully on screen for a selection near the right edge', () => {
    const p = placeToolbar({ x: 1300, y: 100, w: 100, h: 100 }, BAR, AREA)
    expect(p.left).toBe(AREA.w - BAR.w)
    expect(p.left + BAR.w).toBeLessThanOrEqual(AREA.x + AREA.w)
  })

  it('pins left when the toolbar is wider than the work area', () => {
    const p = placeToolbar({ x: 400, y: 100, w: 100, h: 100 }, { w: 2000, h: 44 }, AREA)
    expect(p.left).toBe(AREA.x)
  })

  it('respects a work area that is offset on both axes', () => {
    // e.g. a left-hand Dock plus a menu bar.
    const area: PlacementRect = { x: 80, y: 25, w: 1360, h: 875 }
    const p = placeToolbar({ x: 0, y: 0, w: 1440, h: 900 }, BAR, area)
    expect(p.left).toBeGreaterThanOrEqual(area.x)
    expect(p.top).toBeGreaterThanOrEqual(area.y)
    expect(p.top + BAR.h).toBeLessThanOrEqual(area.y + area.h)
  })

  it('centres on the anchor when asked (the toolbar docking under the recording pill)', () => {
    // A 200px pill centred at x=720; a 560px toolbar centred under it starts at 440.
    const pill = { x: 620, y: 41, w: 200, h: 40 }
    const p = placeToolbar(pill, BAR, AREA, { align: 'center' })
    expect(p.left).toBe(720 - BAR.w / 2)
    expect(p.top).toBe(pill.y + pill.h + GAP)
  })

  it('keeps a centred toolbar on screen when the anchor is dragged to the edge', () => {
    const pill = { x: 1380, y: 41, w: 200, h: 40 }
    const p = placeToolbar(pill, BAR, AREA, { align: 'center' })
    expect(p.left).toBe(AREA.w - BAR.w)
    expect(p.left).toBeGreaterThanOrEqual(AREA.x)
  })

  it('flips a centred toolbar above the anchor near the bottom of the work area', () => {
    const pill = { x: 620, y: 800, w: 200, h: 40 }
    const p = placeToolbar(pill, BAR, AREA, { align: 'center' })
    expect(p.top).toBeLessThan(pill.y)
    expect(p.top + BAR.h).toBeLessThanOrEqual(AREA_BOTTOM)
  })

  it('keeps the toolbar inside the work area for every selection on a grid', () => {
    for (let y = 0; y <= 900; y += 60) {
      for (let h = 20; h <= 900 - y; h += 120) {
        const p = placeToolbar({ x: 0, y, w: 500, h }, BAR, AREA)
        expect(p.top).toBeGreaterThanOrEqual(AREA.y)
        expect(p.top + BAR.h).toBeLessThanOrEqual(AREA_BOTTOM)
      }
    }
  })
})
