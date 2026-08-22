import { useEffect, useRef, useState, type ReactElement } from 'react'
import { RETRO_CHOICES, retroLabel } from './retroWindow'
import type { RetroWindow } from './retroBuffer'
import { barControl, caret, popover } from './styles'

/**
 * How much of the recording to keep, for the command bar. Mirrors QualityControl —
 * each option states what it costs you rather than leaving it to be guessed.
 */
export function RetroControl({
  value,
  onChange
}: {
  value: RetroWindow
  onChange: (w: RetroWindow) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" style={barControl} onClick={() => setOpen((o) => !o)} title="How much to keep">
        {retroLabel(value)} <span style={caret}>▾</span>
      </button>

      {open && (
        <div style={{ ...popover, width: 250, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {RETRO_CHOICES.map((choice) => {
            const selected = choice.value === value
            return (
              <button
                key={choice.label}
                type="button"
                onClick={() => {
                  onChange(choice.value)
                  setOpen(false)
                }}
                style={{
                  appearance: 'none',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                  background: selected ? 'rgba(255,255,255,0.14)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  {choice.label}
                  {selected && <span aria-hidden>✓</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{choice.hint}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
