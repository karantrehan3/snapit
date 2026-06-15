import type { ReactElement } from 'react'
import type { RecordSourceInfo } from '@preload/index'
import { hint, sourceGrid, sourceItem, sourceName, sourceThumb } from './styles'

type Props = {
  sources: RecordSourceInfo[]
  selectedId: string
  onSelect: (id: string) => void
}

/** Thumbnail gallery of capturable sources (screens first, then windows). */
export function SourcePicker({ sources, selectedId, onSelect }: Props): ReactElement {
  return (
    <div style={sourceGrid}>
      {sources.length === 0 && <div style={{ ...hint, gridColumn: '1 / -1' }}>Loading sources…</div>}
      {[...sources]
        .sort((a, b) => (a.type === b.type ? 0 : a.type === 'screen' ? -1 : 1))
        .map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            style={sourceItem(selectedId === s.id)}
            title={s.name}
          >
            <img src={s.thumbnail} style={sourceThumb} alt="" />
            <span style={sourceName}>
              {s.type === 'screen' ? '🖥 ' : '🪟 '}
              {s.name}
            </span>
          </button>
        ))}
    </div>
  )
}
