import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { RecordSourceInfo } from '@preload/index'
import { SourcePicker } from './SourcePicker'
import { barControl, caret, popover } from './styles'

type SourceTab = 'screen' | 'window'

type Props = {
  sources: RecordSourceInfo[]
  loading: boolean
  tab: SourceTab
  onTab: (t: SourceTab) => void
  selectedId: string
  onSelect: (id: string) => void
}

/**
 * Compact source selector for the command bar: a button showing the current
 * source that opens the full thumbnail SourcePicker in a popover above the bar.
 */
export function SourceDropdown(props: Props): ReactElement {
  const { sources, loading, selectedId, onSelect } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on any click outside the dropdown (capture phase, so it fires even
  // though the bar stops mousedown propagation for the region-drag gesture).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  const selected = sources.find((s) => s.id === selectedId)
  const icon = selected?.type === 'window' ? '🪟' : '🖥'
  const label = loading ? 'Loading…' : (selected?.name ?? 'Choose source')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" style={barControl} onClick={() => setOpen((o) => !o)} title={label}>
        <span aria-hidden>{icon}</span>
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={caret}>▾</span>
      </button>

      {open && (
        <div style={{ ...popover, width: 460, maxWidth: '80vw' }}>
          <SourcePicker
            {...props}
            onSelect={(id) => {
              onSelect(id)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
