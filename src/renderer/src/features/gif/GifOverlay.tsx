import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import type { DisplaySource } from '@preload/index'
import type { Mode, Pt, Rect } from '../record/types'
import { SourcePicker } from '../record/SourcePicker'
import { RecordingPill } from '../record/RecordingPill'
import { useSourcePicker } from '../record/useSourcePicker'
import { btn, errorText, hint, panel, regionBox, segment, segmented, veil } from '../record/styles'
import { useGifRecorder } from './useGifRecorder'

const DEFAULT_FPS = 30
const MIN_FPS = 5
const MAX_FPS = 60
const FPS_PRESETS = [15, 30, 60]

const clampFps = (n: number): number => Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(n)))

const recommendBanner: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(10, 132, 255, 0.12)',
  border: '1px solid rgba(10, 132, 255, 0.35)',
  fontSize: 12,
  lineHeight: 1.4
}
const recommendLink: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#0a84ff',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer'
}

const normalize = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y)
})

/**
 * GIF overlay.
 *
 * Setup: pick a source (screen/window), choose full-screen or a dragged region
 * (current display only), set a frame rate, then Start. There is no audio — GIFs
 * are silent. Recording state is owned by useGifRecorder; the Stop pill is a
 * draggable floater and the rest of the overlay is click-through.
 */
export function GifOverlay({ source }: { source: DisplaySource }): ReactElement {
  const [mode, setMode] = useState<Mode>('full')
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [box, setBox] = useState<Rect | null>(null)
  const dragStart = useRef<Pt | null>(null)

  const { sources, loading, tab, setTab, selectedId, setSelectedId, canRegion } = useSourcePicker(source.id)
  const recorder = useGifRecorder()

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
        <div style={{ fontSize: 20, fontWeight: 600 }}>🎞️ GIF recording</div>

        <SourcePicker
          sources={sources}
          loading={loading}
          tab={tab}
          onTab={setTab}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

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
          {FPS_PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setFps(preset)} style={segment(fps === preset)}>
              {preset} fps
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          Custom
          <input
            type="number"
            min={MIN_FPS}
            max={MAX_FPS}
            value={fps}
            onChange={(e) => setFps(clampFps(Number(e.target.value)))}
            style={{
              width: 64,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(0, 0, 0, 0.3)',
              color: '#fff',
              fontVariantNumeric: 'tabular-nums'
            }}
          />
          <span style={{ ...hint, opacity: 0.7 }}>
            fps ({MIN_FPS}–{MAX_FPS})
          </span>
        </label>

        <div style={recommendBanner}>
          <span style={{ opacity: 0.85 }}>
            💡 Sharing to Slack, GitHub or Jira? They autoplay video, which is sharper and much smaller than a
            GIF.
          </span>
          <button type="button" onClick={() => window.snapit.recordVideoInstead()} style={recommendLink}>
            Record video instead →
          </button>
        </div>

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
                fps,
                regionMode: mode === 'region' && canRegion,
                box,
                fallbackWidth: source.width
              })
            }
            style={btn('#ff3b30')}
          >
            ● Start GIF
          </button>
        </div>

        <div style={{ ...hint, opacity: 0.6 }}>Esc to cancel · gif hotkey again to stop</div>
      </div>
    </div>
  )
}
