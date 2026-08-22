import { useCallback, useRef, useState } from 'react'
import { addMarker, type Marker } from './markers'

export type Markers = {
  /** For display — the pill's count badge. */
  markers: Marker[]
  /** Stamp the recording's zero point, where the elapsed timer starts. */
  begin: (t0: number) => void
  /** Drop a marker at the current moment. No-op before `begin`. */
  mark: () => void
  /** The list as it stands right now, for the save call. */
  read: () => Marker[]
}

/**
 * Markers for a running recording, shared by the video and silent recorders so the
 * two can't drift.
 *
 * The list is held in a ref as well as state: `finalize()` is reached from a stable
 * subscription callback, whose closure would otherwise hand the save an empty array.
 */
export function useMarkers(): Markers {
  const [markers, setMarkers] = useState<Marker[]>([])
  const listRef = useRef<Marker[]>([])
  const t0Ref = useRef<number | null>(null)

  const begin = useCallback((t0: number): void => {
    t0Ref.current = t0
    listRef.current = []
    setMarkers([])
  }, [])

  const mark = useCallback((): void => {
    if (t0Ref.current === null) return
    const next = addMarker(listRef.current, Date.now() - t0Ref.current)
    // addMarker returns the same array when the mark was rejected (repeat, cap).
    if (next === listRef.current) return
    listRef.current = next
    setMarkers(next)
  }, [])

  const read = useCallback((): Marker[] => listRef.current, [])

  return { markers, begin, mark, read }
}
