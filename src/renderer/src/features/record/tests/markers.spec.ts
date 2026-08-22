import { describe, it, expect } from 'vitest'
import { addMarker, markerTimeLabel, MAX_MARKERS, MIN_MARKER_GAP_MS, type Marker } from '../markers'

describe('addMarker', () => {
  it('appends without mutating the list it was given', () => {
    const before: Marker[] = []
    const after = addMarker(before, 1500)
    expect(before).toEqual([])
    expect(after).toEqual([{ atMs: 1500, note: '' }])
  })

  it('ignores a repeat from a held hotkey', () => {
    const one = addMarker([], 1000)
    expect(addMarker(one, 1000 + MIN_MARKER_GAP_MS - 1)).toBe(one)
  })

  it('accepts the next mark once the gap has passed', () => {
    const one = addMarker([], 1000)
    expect(addMarker(one, 1000 + MIN_MARKER_GAP_MS)).toHaveLength(2)
  })

  it('refuses to grow past the cap', () => {
    let markers: Marker[] = []
    for (let i = 0; i < MAX_MARKERS + 20; i++) markers = addMarker(markers, i * MIN_MARKER_GAP_MS)
    expect(markers).toHaveLength(MAX_MARKERS)
  })

  it('rejects a timestamp that could not have come from a recording', () => {
    expect(addMarker([], -1)).toEqual([])
    expect(addMarker([], Number.NaN)).toEqual([])
    expect(addMarker([], Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('rounds to whole milliseconds so meta.json stays tidy', () => {
    expect(addMarker([], 1500.7)[0].atMs).toBe(1501)
  })
})

describe('markerTimeLabel', () => {
  it('formats as minutes and padded seconds', () => {
    expect(markerTimeLabel(0)).toBe('0:00')
    expect(markerTimeLabel(7_400)).toBe('0:07')
    expect(markerTimeLabel(727_000)).toBe('12:07')
  })
})
