import { describe, it, expect } from 'vitest'
import type { Marker } from '@preload/index'
import { MIN_MARKER_GAP_MS, MAX_MARKERS } from '@renderer/features/record/markers'
import { addMarkerAt, removeMarker, renameMarker, MAX_NOTE_CHARS } from '../markerEdit'

/**
 * Editing markers after the fact, which the recorder's rules do not cover: it only ever
 * appends at the current moment, and these can land anywhere on a timeline that already
 * has markers either side.
 */

const at = (...times: number[]): Marker[] => times.map((atMs) => ({ atMs, note: '' }))

describe('addMarkerAt', () => {
  it('inserts in order, wherever the playhead was', () => {
    // The recorder can only append; a player can be anywhere.
    const { markers, refused } = addMarkerAt(at(1000, 9000), 4000)
    expect(refused).toBeNull()
    expect(markers.map((m) => m.atMs)).toEqual([1000, 4000, 9000])
  })

  it('refuses a marker on top of one that is already there', () => {
    // A pin drawn over another pin is a pin nobody can click, and two marks this close
    // were one intent when the recorder made them too.
    const { markers, refused } = addMarkerAt(at(5000), 5000 + MIN_MARKER_GAP_MS - 1)
    expect(refused).toMatch(/already a marker/i)
    expect(markers).toHaveLength(1)
  })

  it('allows one exactly a gap away', () => {
    expect(addMarkerAt(at(5000), 5000 + MIN_MARKER_GAP_MS).markers).toHaveLength(2)
  })

  it('checks both directions, not just the last marker', () => {
    // The recorder only ever compares against the end of its list; here the neighbour
    // can be after the new one.
    expect(addMarkerAt(at(9000), 8900).refused).toMatch(/already a marker/i)
  })

  it('holds the line at the cap', () => {
    const full = at(...Array.from({ length: MAX_MARKERS }, (_, i) => i * 1000))
    const { markers, refused } = addMarkerAt(full, 999_000)
    expect(refused).toContain(String(MAX_MARKERS))
    expect(markers).toHaveLength(MAX_MARKERS)
  })

  it('refuses a moment that is not one', () => {
    expect(addMarkerAt([], Number.NaN).refused).toBeTruthy()
    expect(addMarkerAt([], -1).refused).toBeTruthy()
  })

  it('rounds, so a playhead of 3.0004s is a marker at 3000ms', () => {
    expect(addMarkerAt([], 3000.4).markers[0].atMs).toBe(3000)
  })
})

describe('renameMarker', () => {
  it('renames by position, since a marker has no other identity', () => {
    const { markers } = renameMarker(at(1000, 2000), 1, 'the 500 lands here')
    expect(markers.map((m) => m.note)).toEqual(['', 'the 500 lands here'])
  })

  it('does not touch the timestamps', () => {
    expect(renameMarker(at(1000, 2000), 0, 'x').markers.map((m) => m.atMs)).toEqual([1000, 2000])
  })

  it('truncates a note the store would truncate anyway', () => {
    const long = 'x'.repeat(MAX_NOTE_CHARS + 50)
    expect(renameMarker(at(1000), 0, long).markers[0].note).toHaveLength(MAX_NOTE_CHARS)
  })

  it('says so when the marker has gone', () => {
    // The list can be re-read from disk under an open editor.
    expect(renameMarker(at(1000), 4, 'x').refused).toMatch(/no longer there/i)
  })
})

describe('removeMarker', () => {
  it('removes the one at that position and leaves the rest', () => {
    const { markers, refused } = removeMarker(at(1000, 2000, 3000), 1)
    expect(refused).toBeNull()
    expect(markers.map((m) => m.atMs)).toEqual([1000, 3000])
  })

  it('says so when the marker has gone', () => {
    expect(removeMarker(at(1000), 9).refused).toMatch(/no longer there/i)
  })

  it('never mutates what it was given', () => {
    const original = at(1000, 2000)
    removeMarker(original, 0)
    expect(original.map((m) => m.atMs)).toEqual([1000, 2000])
  })
})
