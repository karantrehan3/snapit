import { describe, it, expect } from 'vitest'
import { COLORS, PALETTE } from '../../annotate/types'
import { LIVE_TOOLS } from '../types'

// Both the screenshot and draw-mode toolbars render these lists, so a malformed hex or
// a duplicate would show a broken or indistinguishable swatch on two surfaces at once,
// with no error.
describe('shared annotation palettes', () => {
  it('contains only full-length hex colours', () => {
    for (const c of [...COLORS, ...PALETTE]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('has no duplicates within either list', () => {
    expect(new Set(COLORS).size).toBe(COLORS.length)
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })

  it('keeps the preset row short enough to sit inline beside the tools', () => {
    expect(COLORS.length).toBeLessThanOrEqual(8)
  })
})

describe('LIVE_TOOLS', () => {
  it('has a unique tool, label and title per entry', () => {
    expect(new Set(LIVE_TOOLS.map((t) => t.tool)).size).toBe(LIVE_TOOLS.length)
    expect(new Set(LIVE_TOOLS.map((t) => t.label)).size).toBe(LIVE_TOOLS.length)
    expect(new Set(LIVE_TOOLS.map((t) => t.title)).size).toBe(LIVE_TOOLS.length)
  })

  it('excludes text and move — neither applies to ephemeral live shapes', () => {
    const tools = LIVE_TOOLS.map((t) => String(t.tool))
    expect(tools).not.toContain('text')
    expect(tools).not.toContain('move')
  })
})
