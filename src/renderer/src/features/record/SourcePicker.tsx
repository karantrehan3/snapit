import { useState, type ReactElement } from 'react'
import type { RecordSourceInfo } from '@preload/index'
import {
  hint,
  picker,
  segment,
  segmented,
  sourceGrid,
  sourceItem,
  sourceName,
  sourceThumb,
  spinner,
  spinnerWrap
} from './styles'

type Props = {
  sources: RecordSourceInfo[]
  loading: boolean
  selectedId: string
  onSelect: (id: string) => void
}

/** Source chooser with Screens / Windows tabs (Chrome-style) and a loading spinner. */
export function SourcePicker({ sources, loading, selectedId, onSelect }: Props): ReactElement {
  const [tab, setTab] = useState<'screen' | 'window'>('screen')
  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')
  const shown = tab === 'screen' ? screens : windows

  return (
    <div style={picker}>
      <div style={segmented}>
        <button type="button" onClick={() => setTab('screen')} style={segment(tab === 'screen')}>
          Screens{loading ? '' : ` (${screens.length})`}
        </button>
        <button type="button" onClick={() => setTab('window')} style={segment(tab === 'window')}>
          Windows{loading ? '' : ` (${windows.length})`}
        </button>
      </div>

      {loading ? (
        <div style={spinnerWrap}>
          <span style={spinner} />
          Loading sources…
        </div>
      ) : (
        <div style={sourceGrid}>
          {shown.length === 0 && (
            <div style={{ ...hint, gridColumn: '1 / -1' }}>
              No {tab === 'screen' ? 'screens' : 'windows'} found.
            </div>
          )}
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              style={sourceItem(selectedId === s.id)}
              title={s.name}
            >
              <img src={s.thumbnail} style={sourceThumb} alt="" />
              <span style={sourceName}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
