import { useEffect, useState } from 'react'
import type { RecordSourceInfo } from '@preload/index'

type SourceTab = 'screen' | 'window'

type SourcePicker = {
  sources: RecordSourceInfo[]
  loading: boolean
  tab: SourceTab
  setTab: (t: SourceTab) => void
  selectedId: string
  setSelectedId: (id: string) => void
  canRegion: boolean
}

/**
 * Loads the capturable sources (screens + windows), tracks the active tab and the
 * selection, and keeps them in sync: switching tabs points the selection at that
 * tab's source. Region capture only applies to the current display, so `canRegion`
 * is true only on the Screens tab with that display selected.
 */
export function useSourcePicker(currentDisplayId: string): SourcePicker {
  const [sources, setSources] = useState<RecordSourceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTabState] = useState<SourceTab>('screen')
  const [selectedId, setSelectedId] = useState<string>(currentDisplayId)

  useEffect(() => {
    void window.snapit.listSources().then((s) => {
      setSources(s)
      setLoading(false)
    })
  }, [])

  const setTab = (t: SourceTab): void => {
    setTabState(t)
    if (t === 'screen') {
      setSelectedId(currentDisplayId)
    } else {
      const firstWindow = sources.find((s) => s.type === 'window')
      if (firstWindow) setSelectedId(firstWindow.id)
    }
  }

  return {
    sources,
    loading,
    tab,
    setTab,
    selectedId,
    setSelectedId,
    canRegion: tab === 'screen' && selectedId === currentDisplayId
  }
}
