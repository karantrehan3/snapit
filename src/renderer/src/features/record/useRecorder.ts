import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { Phase, Pt, Rect, RecordParams } from './types'

const MIN_REGION = 8
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4'
]
const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Prefer native MP4 (H.264/AAC); fall back to WebM if the runtime lacks it. */
function pickRecording(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const mp4 = MP4_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c))
  if (mp4) return { mimeType: mp4, ext: 'mp4' }
  const webm = WEBM_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c))
  return { mimeType: webm ?? '', ext: 'webm' }
}

export type Recorder = {
  phase: Phase
  elapsed: number
  saving: boolean
  error: string | null
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onPillMouseDown: (e: ReactMouseEvent) => void
  start: (params: RecordParams) => Promise<void>
  stop: () => void
}

/**
 * Screen-recording engine: acquires the display stream (+ optional system/mic
 * audio), optionally crops to a region via canvas, records with MediaRecorder,
 * and saves the result. Owns the recording lifecycle, the elapsed timer, and the
 * draggable Stop-pill / click-through behaviour while recording.
 */
export function useRecorder(): Recorder {
  const [phase, setPhase] = useState<Phase>('setup')
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

  const getDisplayStream = async (
    systemAudio: boolean,
    frameRate: number,
    sourceId: string
  ): Promise<MediaStream> => {
    await window.snapit.prepareRecording(systemAudio, sourceId)
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate }, audio: systemAudio })
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
    // Throttle the copy to the target fps — rAF can fire at the display's refresh
    // rate (e.g. 120 Hz), so an unthrottled loop would redraw far more than needed.
    const minInterval = 1000 / frameRate
    let lastDraw = 0
    const draw = (now: number): void => {
      if (now - lastDraw >= minInterval) {
        lastDraw = now
        ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
      }
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

  const start = async (params: RecordParams): Promise<void> => {
    setError(null)
    const { selectedId, systemAudio, mic, fps, regionMode, box, fallbackWidth } = params
    if (regionMode && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    try {
      const display = await getDisplayStream(systemAudio, fps, selectedId)
      streamsRef.current.push(display)
      const settings = display.getVideoTracks()[0]?.getSettings()
      const scale = (settings?.width ?? fallbackWidth) / window.innerWidth

      const recordStream =
        regionMode && box
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

  return { phase, elapsed, saving, error, pillPos, pillRef, onPillMouseDown, start, stop }
}
