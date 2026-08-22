/**
 * Markers: timestamped anchors dropped while a recording runs, so the moment
 * something went wrong can be pointed at instead of hunted for.
 *
 * Pure, so the guards are unit-testable without a recorder.
 */

import type { Marker } from '@preload/index'

export type { Marker }

/** Enough to mark every step of a long flow; a bound so a stuck key can't grow it forever. */
export const MAX_MARKERS = 100

/** A held hotkey auto-repeats — two marks this close are one intent, not two. */
export const MIN_MARKER_GAP_MS = 400

export function addMarker(markers: Marker[], atMs: number, note = ''): Marker[] {
  if (!Number.isFinite(atMs) || atMs < 0) return markers
  if (markers.length >= MAX_MARKERS) return markers
  const last = markers[markers.length - 1]
  if (last && atMs - last.atMs < MIN_MARKER_GAP_MS) return markers
  return [...markers, { atMs: Math.round(atMs), note }]
}

/**
 * Shift markers onto a trimmed recording's clock, dropping the ones that fall before
 * it starts. A marker at 5:00 of a recording whose last 30 seconds were kept does not
 * point at anything in the file.
 */
export function rebaseMarkers(markers: readonly Marker[], offsetMs: number): Marker[] {
  if (offsetMs <= 0) return markers.slice()
  return markers.filter((m) => m.atMs >= offsetMs).map((m) => ({ ...m, atMs: m.atMs - offsetMs }))
}

/** `0:07` / `12:07` — how a marker reads on the pill and in the report. */
export function markerTimeLabel(atMs: number): string {
  const total = Math.max(0, Math.floor(atMs / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
