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
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4'
]
const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

const normalize = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y)
})

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Prefer native MP4 (H.264/AAC); fall back to WebM if the runtime lacks it. */
function pickRecording(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const mp4 = MP4_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c))
  if (mp4) return { mimeType: mp4, ext: 'mp4' }
  const webm = WEBM_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c))
  return { mimeType: webm ?? '', ext: 'webm' }
}

/**
 * Record overlay — Phase 2.
 *
 * Setup: choose full-screen or a dragged region, toggle system + mic audio, then
 * Start. Recording: the overlay goes click-through (screen stays usable) and only
 * a top-center Stop pill remains interactive. Full-screen records the desktop
 * stream; region pipes it through a cropped canvas. System (loopback) audio comes
 * from getDisplayMedia; mic from getUserMedia; both are mixed via WebAudio. Output
 * is a native .mp4 when supported, otherwise .webm.
 */
export function RecordOverlay({ source }: { source: DisplaySource }): ReactElement {
  const [phase, setPhase] = useState<Phase>('setup')
  const [mode, setMode] = useState<Mode>('full')
  const [systemAudio, setSystemAudio] = useState(true)
  const [mic, setMic] = useState(false)
  const [fps, setFps] = useState(60)
  const [box, setBox] = useState<Rect | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pillPos, setPillPos] = useState<Pt | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const extRef = useRef<'mp4' | 'webm'>('webm')
  const rafRef = useRef<number | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)
  const dragStart = useRef<Pt | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const pillDrag = useRef<{ dx: number; dy: number } | null>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const cleanupStreams = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }

  const finalize = async (): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    window.clearInterval(timerRef.current)
    cleanupStreams()
    const ext = extRef.current
    const blob = new Blob(chunksRef.current, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' })
    if (blob.size === 0) {
      window.snapit.closeOverlay()
      return
    }
    await window.snapit.saveRecording(await blob.arrayBuffer(), ext)
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

  // While recording, keep the overlay click-through except over the (draggable) pill.
  useEffect(() => {
    if (phase !== 'recording') return
    window.snapit.setMouseIgnore(true)
    let over = false
    const onMove = (e: MouseEvent): void => {
      if (pillDrag.current) {
        window.snapit.setMouseIgnore(false)
        setPillPos({ x: e.clientX - pillDrag.current.dx, y: e.clientY - pillDrag.current.dy })
        return
      }
      const r = pillRef.current?.getBoundingClientRect()
      const isOver =
        !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (isOver !== over) {
        over = isOver
        window.snapit.setMouseIgnore(!isOver)
      }
    }
    const onUp = (): void => {
      pillDrag.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.snapit.setMouseIgnore(false)
    }
  }, [phase])

  const onPillMouseDown = (e: ReactMouseEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return // let the Stop button click through
    const r = pillRef.current?.getBoundingClientRect()
    if (!r) return
    pillDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.preventDefault()
  }

  const getDisplayStream = async (wantSystemAudio: boolean, frameRate: number): Promise<MediaStream> => {
    await window.snapit.prepareRecording(wantSystemAudio)
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate }, audio: wantSystemAudio })
  }

  // Pipe the full-screen video through a canvas cropped to the selected region.
  const buildRegionVideo = (
    display: MediaStream,
    region: Rect,
    scale: number,
    frameRate: number
  ): MediaStream => {
    const sx = Math.round(region.x * scale)
    const sy = Math.round(region.y * scale)
    const sw = Math.round(region.w * scale)
    const sh = Math.round(region.h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    const video = document.createElement('video')
    video.srcObject = new MediaStream(display.getVideoTracks())
    video.muted = true
    void video.play()
    const draw = (): void => {
      ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    const stream = canvas.captureStream(frameRate)
    streamsRef.current.push(stream)
    return stream
  }

  // One audio track: pass through if single source, mix via WebAudio if both.
  const mixAudio = (tracks: MediaStreamTrack[]): MediaStreamTrack | null => {
    if (tracks.length === 0) return null
    if (tracks.length === 1) return tracks[0]
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const dest = ctx.createMediaStreamDestination()
    tracks.forEach((t) => ctx.createMediaStreamSource(new MediaStream([t])).connect(dest))
    return dest.stream.getAudioTracks()[0]
  }

  const start = async (): Promise<void> => {
    setError(null)
    if (mode === 'region' && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    try {
      const display = await getDisplayStream(systemAudio, fps)
      streamsRef.current.push(display)
      const settings = display.getVideoTracks()[0]?.getSettings()
      const scale = (settings?.width ?? source.width) / window.innerWidth

      const recordStream =
        mode === 'region' && box
          ? buildRegionVideo(display, box, scale, fps)
          : new MediaStream(display.getVideoTracks())

      const audioTracks: MediaStreamTrack[] = []
      if (systemAudio) audioTracks.push(...display.getAudioTracks())
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(micStream)
          audioTracks.push(...micStream.getAudioTracks())
        } catch (e) {
          console.error('[snapit] microphone unavailable, recording without it:', msg(e))
        }
      }
      const audio = mixAudio(audioTracks)
      if (audio) recordStream.addTrack(audio)

      const { mimeType, ext } = pickRecording()
      extRef.current = ext
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
    const placement: CSSProperties = pillPos
      ? { left: pillPos.x, top: pillPos.y, transform: 'none' }
      : { left: '50%', top: 16, transform: 'translateX(-50%)' }
    return (
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div ref={pillRef} style={{ ...pillStyle, ...placement }}>
          {saving ? (
            <span>Saving…</span>
          ) : (
            <>
              <span style={gripStyle} onMouseDown={onPillMouseDown} title="Drag to move">
                ⠿
              </span>
              <span style={recDot} />
              <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>{fmt(elapsed)}</span>
              <button type="button" onClick={stop} style={stopButton}>
                ⏹ Stop
              </button>
            </>
          )}
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
  gap: 12,
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

const gripStyle: CSSProperties = {
  cursor: 'grab',
  color: 'rgba(255, 255, 255, 0.45)',
  fontSize: 16,
  lineHeight: 1,
  userSelect: 'none'
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
