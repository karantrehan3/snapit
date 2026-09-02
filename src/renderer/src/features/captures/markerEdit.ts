import { MAX_MARKERS, MIN_MARKER_GAP_MS, type Marker } from '@renderer/features/record/markers'

/**
 * Editing the markers of a capture that has been saved.
 *
 * Separate from `record/markers.ts`, which stamps them while a recording runs, because
 * the two answer different questions. The recorder only ever appends to the end of a
 * list at the current moment, and its guard is "a held hotkey is one intent". Here a
 * marker can be added anywhere on a timeline that already has markers on both sides of
 * it, renamed, or removed — so the rules it shares with the recorder are the *bounds*
 * (how many, how close), not the insertion.
 *
 * Pure, and returns a refusal rather than throwing: every one of these is driven by a
 * control someone just pressed, and the answer "not there" belongs on screen next to it.
 */

/** What the store keeps; `sanitizeMarkers` truncates at the same length. */
export const MAX_NOTE_CHARS = 500

export type MarkerEdit = { markers: Marker[]; refused: string | null }

const unchanged = (markers: readonly Marker[], refused: string): MarkerEdit => ({
  markers: [...markers],
  refused
})

/**
 * Add one at `atMs`, keeping the list sorted.
 *
 * Refuses within `MIN_MARKER_GAP_MS` of an existing marker, which is the recorder's rule
 * applied in both directions: two marks that close are one moment, and a second pin
 * drawn on top of the first would be a pin nobody can click.
 */
export function addMarkerAt(markers: readonly Marker[], atMs: number, note = ''): MarkerEdit {
  if (!Number.isFinite(atMs) || atMs < 0) return unchanged(markers, 'That is not a moment in this recording.')
  if (markers.length >= MAX_MARKERS) return unchanged(markers, `A capture holds ${MAX_MARKERS} markers.`)
  const at = Math.round(atMs)
  if (markers.some((m) => Math.abs(m.atMs - at) < MIN_MARKER_GAP_MS)) {
    return unchanged(markers, 'There is already a marker here.')
  }
  const next = [...markers, { atMs: at, note: note.slice(0, MAX_NOTE_CHARS) }]
  next.sort((a, b) => a.atMs - b.atMs)
  return { markers: next, refused: null }
}

/** Rename by position, because a marker's only other identity is its timestamp. */
export function renameMarker(markers: readonly Marker[], index: number, note: string): MarkerEdit {
  const target = markers[index]
  if (!target) return unchanged(markers, 'That marker is no longer there.')
  const next = markers.map((m, i) => (i === index ? { ...m, note: note.slice(0, MAX_NOTE_CHARS) } : m))
  return { markers: next, refused: null }
}

export function removeMarker(markers: readonly Marker[], index: number): MarkerEdit {
  if (!markers[index]) return unchanged(markers, 'That marker is no longer there.')
  return { markers: markers.filter((_, i) => i !== index), refused: null }
}
