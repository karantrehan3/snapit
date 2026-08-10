import { describe, it, expect } from 'vitest'
import { previewSize, INLINE_PREVIEW_MAX_WIDTH } from '../inlinePreview'

describe('previewSize', () => {
  it('leaves images at or under the max width unchanged', () => {
    expect(previewSize(1200, 800)).toEqual({ width: 1200, height: 800 })
    expect(previewSize(INLINE_PREVIEW_MAX_WIDTH, 900)).toEqual({
      width: INLINE_PREVIEW_MAX_WIDTH,
      height: 900
    })
  })

  it('downscales proportionally when wider than the max width', () => {
    // 3024x1964 (Retina-class) -> capped to 1400 wide, aspect preserved
    expect(previewSize(3024, 1964)).toEqual({ width: 1400, height: 909 })
  })

  it('honours a custom max width', () => {
    expect(previewSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 })
  })

  it('never rounds height down to zero for extreme aspect ratios', () => {
    expect(previewSize(10000, 1, 1400).height).toBeGreaterThanOrEqual(1)
  })
})
