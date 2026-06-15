import { useEffect, useState } from 'react'
import type { RecordSourceInfo } from '@preload/index'

type SourcePicker = {
  sources: RecordSourceInfo[]
  loading: boolean
  selectedId: string
  setSelectedId: (id: string) => void
  canRegion: boolean
}

/**
 * Loads the capturable sources (screens + windows) and tracks the selection.
 * Region capture only makes sense for the current display (the overlay's own
 * screen), so `canRegion` is true only while that source is selected.
 */
export function useSourcePicker(currentDisplayId: string): SourcePicker {
  const [sources, setSources] = useState<RecordSourceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>(currentDisplayId)

  useEffect(() => {
    void window.snapit.listSources().then((s) => {
      setSources(s)
      setLoading(false)
    })
  }, [])

  return { sources, loading, selectedId, setSelectedId, canRegion: selectedId === currentDisplayId }
}
