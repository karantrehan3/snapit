import { useEffect, useRef, useState, type ReactElement } from 'react'
import { QUALITY_ORDER, QUALITY_PRESETS, type QualityPreset } from './quality'
import { barControl, caret, popover } from './styles'
import { Icon } from '@renderer/components/Icon'

/**
 * Quality selector for the command bar, shared by the video and silent recorders.
 *
 * Each option carries its trade-off as a hint rather than leaving the user to guess what
 * "High" costs — the difference between presets is real (roughly 2x in file size across the
 * range), so it is worth stating.
 */
export function QualityControl({
  value,
  onChange
}: {
  value: QualityPreset
  onChange: (q: QualityPreset) => void
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
      <button type="button" style={barControl} onClick={() => setOpen((o) => !o)} title="Recording quality">
        {QUALITY_PRESETS[value].label}{' '}
        <span style={caret}>
          <Icon name="chevron-down" size={12} />
        </span>
      </button>

      {open && (
        <div style={{ ...popover, width: 250, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {QUALITY_ORDER.map((preset) => {
            const { label, hint } = QUALITY_PRESETS[preset]
            const selected = preset === value
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onChange(preset)
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
                  {label}
                  {selected && <span aria-hidden>✓</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{hint}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
