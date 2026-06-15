import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import type { DisplaySource } from '../../preload/index'

type Phase = 'setup' | 'recording'
type Mode = 'full' | 'region'
type Pt = { x: number; y: number }
type Rect = { x: number; y: number; w: number; h: number }

const MIN_REGION = 8
const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

const normalize = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y)
})

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function pickMime(): string {
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c)) ?? ''
}

/**
 * Record overlay — Phase 2.
 *
 * Setup: choose full-screen or a dragged region, toggle the mic, then Start.
 * Recording: the overlay goes click-through (screen stays usable) and only a
 * top-center Stop pill remains interactive. Full-screen records the desktop
 * stream directly; region pipes the stream through a cropped canvas. Output is
 * a .webm saved to the configured folder.
 */
export function RecordOverlay({ source }: { source: DisplaySource }): ReactElement {
  const [phase, setPhase] = useState<Phase>('setup')
  const [mode, setMode] = useState<Mode>('full')
  const [mic, setMic] = useState(true)
  const [box, setBox] = useState<Rect | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const rafRef = useRef<number | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)
  const dragStart = useRef<Pt | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const cleanupStreams = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
  }

  const finalize = async (): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    window.clearInterval(timerRef.current)
    cleanupStreams()
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    if (blob.size === 0) {
      window.snapit.closeOverlay()
      return
    }
    await window.snapit.saveRecording(await blob.arrayBuffer())
  }

  const stop = (): void => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else void finalize()
  }

  // The record hotkey (pressed again) or Esc stops & saves; in setup it cancels.
  useEffect(() => {
    const off = window.snapit.onStopRecording(() => {
      if (phaseRef.current === 'recording') stop()
      else window.snapit.closeOverlay()
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (phaseRef.current === 'recording') stop()
      else window.snapit.closeOverlay()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => () => cleanupStreams(), [])

  // While recording, keep the overlay click-through except over the Stop pill.
  useEffect(() => {
    if (phase !== 'recording') return
    window.snapit.setMouseIgnore(true)
    let over = false
    const onMove = (e: MouseEvent): void => {
      const r = pillRef.current?.getBoundingClientRect()
      const isOver =
        !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (isOver !== over) {
        over = isOver
        window.snapit.setMouseIgnore(!isOver)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.snapit.setMouseIgnore(false)
    }
  }, [phase])

  const getDisplayStream = (): Promise<MediaStream> => {
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxWidth: source.width,
          maxHeight: source.height,
          maxFrameRate: 30
        }
      }
    } as unknown as MediaStreamConstraints
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  // Pipe the full-screen stream through a canvas cropped to the selected region.
  const buildRegionStream = (display: MediaStream, region: Rect): MediaStream => {
    const scale = source.width / window.innerWidth
    const sx = Math.round(region.x * scale)
    const sy = Math.round(region.y * scale)
    const sw = Math.round(region.w * scale)
    const sh = Math.round(region.h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    const video = document.createElement('video')
    video.srcObject = display
    video.muted = true
    void video.play()
    const draw = (): void => {
      ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    const stream = canvas.captureStream(30)
    streamsRef.current.push(stream)
    return stream
  }

  const start = async (): Promise<void> => {
    setError(null)
    if (mode === 'region' && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    try {
      const display = await getDisplayStream()
      streamsRef.current.push(display)
      const recordStream = mode === 'region' && box ? buildRegionStream(display, box) : display

      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(micStream)
          micStream.getAudioTracks().forEach((t) => recordStream.addTrack(t))
        } catch (e) {
          console.error('[snapit] microphone unavailable, recording without audio:', msg(e))
        }
      }

      const mimeType = pickMime()
      const rec = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e): void => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = (): void => void finalize()
      rec.start()

      const t0 = Date.now()
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    } catch (e) {
      setError(`Could not start recording: ${msg(e)}`)
      setPhase('setup')
    }
  }

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

  if (phase === 'recording') {
    return (
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div ref={pillRef} style={pillStyle}>
          <span style={recDot} />
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{fmt(elapsed)}</span>
          <button type="button" onClick={stop} style={stopButton}>
            ⏹ Stop
          </button>
        </div>
      </div>
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

        <div style={segmented}>
          <button type="button" onClick={() => setMode('full')} style={segment(mode === 'full')}>
            Full screen
          </button>
          <button type="button" onClick={() => setMode('region')} style={segment(mode === 'region')}>
            Region
          </button>
        </div>

        {mode === 'region' && <div style={hint}>Drag on the screen to select a region.</div>}

        <label style={checkboxRow}>
          <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
          Record microphone audio
        </label>

        {error && <div style={errorText}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={() => window.snapit.closeOverlay()} style={btn('#48484a')}>
            Cancel
          </button>
          <button type="button" onClick={() => void start()} style={btn('#ff3b30')}>
            ● Start recording
          </button>
        </div>

        <div style={{ ...hint, opacity: 0.6 }}>Esc to cancel · record hotkey again to stop</div>
      </div>
    </div>
  )
}

const veil: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  font: '14px -apple-system, system-ui, sans-serif',
  color: '#fff'
}

const regionBox: CSSProperties = {
  position: 'fixed',
  border: '2px solid #ff3b30',
  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
  pointerEvents: 'none'
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 24,
  minWidth: 320,
  borderRadius: 14,
  background: 'rgba(28, 28, 30, 0.96)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)'
}

const segmented: CSSProperties = {
  display: 'flex',
  padding: 3,
  borderRadius: 9,
  background: 'rgba(255, 255, 255, 0.08)'
}

function segment(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: 30,
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: active ? '#0a84ff' : 'transparent'
  }
}

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer'
}

const hint: CSSProperties = { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }

const errorText: CSSProperties = { fontSize: 12, color: '#ff453a' }

function btn(bg: string): CSSProperties {
  return {
    flex: 1,
    height: 34,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: bg
  }
}

const pillStyle: CSSProperties = {
  position: 'fixed',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(28, 28, 30, 0.95)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
  color: '#fff',
  font: '13px -apple-system, system-ui, sans-serif',
  pointerEvents: 'auto'
}

const recDot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#ff3b30',
  boxShadow: '0 0 0 0 rgba(255, 59, 48, 0.6)',
  animation: 'snapitPulse 1.4s ease-out infinite'
}

const stopButton: CSSProperties = {
  height: 26,
  padding: '0 12px',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  background: '#ff3b30'
}
