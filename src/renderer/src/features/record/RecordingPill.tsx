import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement, RefObject } from 'react'
import type { Pt } from './types'
import { grip, pill, recDot, stopButton } from './styles'

type Props = {
  elapsed: number
  saving: boolean
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onGripMouseDown: (e: ReactMouseEvent) => void
  onStop: () => void
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The recording indicator: a draggable pill with elapsed time and a Stop button. */
export function RecordingPill({
  elapsed,
  saving,
  pillPos,
  pillRef,
  onGripMouseDown,
  onStop
}: Props): ReactElement {
  const placement: CSSProperties = pillPos
    ? { left: pillPos.x, top: pillPos.y, transform: 'none' }
    : { left: '50%', top: 16, transform: 'translateX(-50%)' }
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <div ref={pillRef} style={{ ...pill, ...placement }}>
        {saving ? (
          <span>Saving…</span>
        ) : (
          <>
            <span style={grip} onMouseDown={onGripMouseDown} title="Drag to move">
              ⠿
            </span>
            <span style={recDot} />
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{fmt(elapsed)}</span>
            <button type="button" onClick={onStop} style={stopButton}>
              ⏹ Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
