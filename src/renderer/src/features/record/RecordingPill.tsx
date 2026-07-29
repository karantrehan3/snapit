import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement, RefObject } from 'react'
import type { WorkArea } from '@preload/index'
import type { Pt } from './types'
import { grip, pill, pillToggle, recDot, stopButton } from './styles'

/** Inset from the top of the *usable* area, so the pill clears the macOS menu bar. */
const TOP_MARGIN = 16

type Props = {
  elapsed: number
  saving: boolean
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  workArea: WorkArea
  onGripMouseDown: (e: ReactMouseEvent) => void
  onStop: () => void
  drawMode?: boolean
  onToggleDraw?: () => void
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * The recording indicator: a draggable pill with elapsed time, an optional
 * draw-mode toggle, and a Stop button. `data-no-draw` keeps clicks on the pill from
 * starting an annotation stroke on the canvas beneath it.
 */
export function RecordingPill({
  elapsed,
  saving,
  pillPos,
  pillRef,
  workArea,
  onGripMouseDown,
  onStop,
  drawMode = false,
  onToggleDraw
}: Props): ReactElement {
  const placement: CSSProperties = pillPos
    ? { left: pillPos.x, top: pillPos.y, transform: 'none' }
    : { left: '50%', top: workArea.y + TOP_MARGIN, transform: 'translateX(-50%)' }
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <div ref={pillRef} style={{ ...pill, ...placement }} data-no-draw>
        {saving ? (
          <span>Saving…</span>
        ) : (
          <>
            <span style={grip} onMouseDown={onGripMouseDown} title="Drag to move">
              ⠿
            </span>
            <span style={recDot} />
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{fmt(elapsed)}</span>
            {onToggleDraw && (
              <button
                type="button"
                onClick={onToggleDraw}
                style={pillToggle(drawMode)}
                title={drawMode ? 'Stop annotating (Esc)' : 'Annotate on screen'}
                aria-label="Toggle annotation drawing"
                aria-pressed={drawMode}
              >
                ✎
              </button>
            )}
            <button type="button" onClick={onStop} style={stopButton}>
              ⏹ Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
