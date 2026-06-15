import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react'
import type { DisplaySource } from '@preload/index'
import type { Mode, Pt, Rect } from './types'
import { useRecorder } from './useRecorder'
import { useSourcePicker } from './useSourcePicker'
import { SourcePicker } from './SourcePicker'
import { RecordingPill } from './RecordingPill'
import { btn, checkboxRow, errorText, hint, panel, regionBox, segment, segmented, veil } from './styles'

const normalize = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y)
})

/**
 * Record overlay — Phase 2.
 *
 * Setup: pick a source (screen/window), choose full-screen or a dragged region
 * (current display only), set fps, toggle system + mic audio, then Start.
 * Recording state is owned by useRecorder; the Stop pill is a draggable floater
 * and the rest of the overlay is click-through so the screen stays usable.
 */
export function RecordOverlay({ source }: { source: DisplaySource }): ReactElement {
  const [mode, setMode] = useState<Mode>('full')
  const [systemAudio, setSystemAudio] = useState(true)
  const [mic, setMic] = useState(false)
  const [fps, setFps] = useState(60)
  const [box, setBox] = useState<Rect | null>(null)
  const dragStart = useRef<Pt | null>(null)

  const { sources, selectedId, setSelectedId, canRegion } = useSourcePicker(source.id)
  const recorder = useRecorder()

  useEffect(() => {
    if (!canRegion && mode === 'region') setMode('full')
  }, [canRegion, mode])

  const onVeilMouseDown = (e: ReactMouseEvent): void => {
    if (mode !== 'region' || e.target !== e.currentTarget) return
    dragStart.current = { x: e.clientX, y: e.clientY }
    setBox({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }
  const onVeilMouseMove = (e: ReactMouseEvent): void => {
    if (!dragStart.current) return
    setBox(normalize(dragStart.current, { x: e.clientX, y: e.clientY }))
  }
  const onVeilMouseUp = (): void => {
    dragStart.current = null
  }

  if (recorder.phase === 'recording') {
    return (
      <RecordingPill
        elapsed={recorder.elapsed}
        saving={recorder.saving}
        pillPos={recorder.pillPos}
        pillRef={recorder.pillRef}
        onGripMouseDown={recorder.onPillMouseDown}
        onStop={recorder.stop}
      />
    )
  }

  return (
    <div
      style={{ ...veil, cursor: mode === 'region' ? 'crosshair' : 'default' }}
      onMouseDown={onVeilMouseDown}
      onMouseMove={onVeilMouseMove}
      onMouseUp={onVeilMouseUp}
    >
      {mode === 'region' && box && (
        <div style={{ ...regionBox, left: box.x, top: box.y, width: box.w, height: box.h }} />
      )}

      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>🎥 Screen recording</div>

        <SourcePicker sources={sources} selectedId={selectedId} onSelect={setSelectedId} />

        {canRegion && (
          <>
            <div style={segmented}>
              <button type="button" onClick={() => setMode('full')} style={segment(mode === 'full')}>
                Full screen
              </button>
              <button type="button" onClick={() => setMode('region')} style={segment(mode === 'region')}>
                Region
              </button>
            </div>
            {mode === 'region' && <div style={hint}>Drag on the screen to select a region.</div>}
          </>
        )}

        <div style={segmented}>
          <button type="button" onClick={() => setFps(30)} style={segment(fps === 30)}>
            30 fps
          </button>
          <button type="button" onClick={() => setFps(60)} style={segment(fps === 60)}>
            60 fps
          </button>
        </div>

        <label style={checkboxRow}>
          <input type="checkbox" checked={systemAudio} onChange={(e) => setSystemAudio(e.target.checked)} />
          System audio
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
          Microphone
        </label>

        {recorder.error && <div style={errorText}>{recorder.error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={() => window.snapit.closeOverlay()} style={btn('#48484a')}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              void recorder.start({
                selectedId,
                systemAudio,
                mic,
                fps,
                regionMode: mode === 'region' && canRegion,
                box,
                fallbackWidth: source.width
              })
            }
            style={btn('#ff3b30')}
          >
            ● Start recording
          </button>
        </div>

        <div style={{ ...hint, opacity: 0.6 }}>Esc to cancel · record hotkey again to stop</div>
      </div>
    </div>
  )
}
