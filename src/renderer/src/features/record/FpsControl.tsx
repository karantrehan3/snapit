import { useEffect, useRef, useState, type ReactElement } from 'react'
import { barControl, caret, fpsInput, popover, segment, segmented } from './styles'

const MIN_FPS = 5
const MAX_FPS = 60
const PRESETS = [15, 30, 60]

const clampFps = (n: number): number => Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(n)))

/** Frame-rate selector for the command bar: presets (15/30/60) plus a custom value. */
export function FpsControl({
  value,
  onChange
}: {
  value: number
  onChange: (n: number) => void
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
      <button type="button" style={barControl} onClick={() => setOpen((o) => !o)} title="Frame rate">
        {value} fps <span style={caret}>▾</span>
      </button>

      {open && (
        <div style={{ ...popover, width: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={segmented}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                style={segment(value === p)}
                onClick={() => {
                  onChange(p)
                  setOpen(false)
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            Custom
            <input
              type="number"
              min={MIN_FPS}
              max={MAX_FPS}
              value={value}
              onChange={(e) => onChange(clampFps(Number(e.target.value)))}
              style={fpsInput}
            />
            <span style={{ opacity: 0.6 }}>
              fps ({MIN_FPS}–{MAX_FPS})
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
