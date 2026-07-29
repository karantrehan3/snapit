import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { AnnotationOptions, Phase, Pt, Rect, RecordParams } from './types'
import { useRecordingPointer } from './useRecordingPointer'
import { targetBitrate } from './bitrate'
import { encodeSize } from './encodeSize'
import { drawAnnotations } from '../annotate-live/composite'
import { useLatestRef } from '@renderer/lib/useLatestRef'

const MIN_REGION = 8
/**
 * H.264 profiles, best first. Ordering matters more than it looks: `avc1.42E01E` is
 * *constrained baseline*, the weakest profile H.264 defines — no CABAC, no 8x8 transform
 * — and asking for it first was leaving ~20% of the file size on the table.
 *
 * Measured in this Chromium build, encoding identical frames at an identical bitrate
 * request and scored against a lossless reference: High delivered 522 kbps at SSIM
 * 0.8201, where constrained baseline needed 663 kbps for a worse 0.8158. High is strictly
 * better on both axes, not a trade.
 *
 * HEVC (`hvc1`) is supported here too and goes further still — 422 kbps at SSIM 0.8166 —
 * but it is deliberately not listed: an .mp4 that only plays in the Apple ecosystem and
 * recent Chrome is the wrong default for a tool whose output gets shared around.
 */
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.64002A,mp4a.40.2', // High 4.2
  'video/mp4;codecs=avc1.640028,mp4a.40.2', // High 4.0
  'video/mp4;codecs=avc1.4D401F,mp4a.40.2', // Main 3.1
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // constrained baseline — last resort
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
 * and saves the result. Owns the recording lifecycle and the elapsed timer; the
 * Stop-pill / click-through behaviour lives in useRecordingPointer.
 */
export function useRecorder({ drawMode, getAnnotationCanvas }: AnnotationOptions): Recorder {
  const [phase, setPhase] = useState<Phase>('setup')
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const extRef = useRef<'mp4' | 'webm'>('webm')
  const rafRef = useRef<number | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)

  const { pillPos, pillRef, onPillMouseDown } = useRecordingPointer(phase, drawMode)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const drawModeRef = useLatestRef(drawMode)
  // Held in a ref so the long-lived rAF copy loop never closes over a stale getter.
  const annoRef = useLatestRef(getAnnotationCanvas)

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
      // Draw mode owns Escape (clear, then exit): stopping here would end the
      // recording when the user only meant to dismiss their annotations. The record
      // hotkey still stops from anywhere.
      if (drawModeRef.current) return
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

  const getDisplayStream = async (
    systemAudio: boolean,
    frameRate: number,
    sourceId: string
  ): Promise<MediaStream> => {
    await window.snapit.prepareRecording(systemAudio, sourceId)
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate }, audio: systemAudio })
  }

  /**
   * Pipe the display video through a canvas — cropped to `region`, or the whole
   * frame when it is null. This is also the only path that can burn in annotations,
   * since MediaRecorder encodes whatever this canvas holds.
   */
  const buildCanvasVideo = (
    display: MediaStream,
    region: Rect | null,
    scale: number,
    frameRate: number,
    frame: { w: number; h: number },
    out: { w: number; h: number }
  ): MediaStream => {
    const sx = region ? Math.round(region.x * scale) : 0
    const sy = region ? Math.round(region.y * scale) : 0
    const sw = region ? Math.round(region.w * scale) : frame.w
    const sh = region ? Math.round(region.h * scale) : frame.h
    const canvas = document.createElement('canvas')
    canvas.width = out.w
    canvas.height = out.h
    // alpha: false — the video frame covers the canvas completely every draw, so the
    // destination never needs transparency (annotations still composite over it
    // normally). Skipping the alpha channel makes this per-frame blit cheaper, which
    // matters now that full-screen recording takes this path by default.
    const ctx = canvas.getContext('2d', { alpha: false })
    // High-quality resampling for the Retina 2x → 1x downscale, as the GIF path does.
    if (ctx) ctx.imageSmoothingQuality = 'high'
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
        if (region) ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        // Full frame: the scale-only form draws the whole video in, so a track that
        // reports a different size than getSettings() did can't yield a bad crop.
        else ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
        drawAnnotations(ctx, annoRef.current(), region, canvas.width, canvas.height)
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
    const { selectedId, systemAudio, mic, fps, regionMode, box, annotatable, fallbackWidth, fallbackHeight } =
      params
    if (regionMode && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    try {
      const display = await getDisplayStream(systemAudio, fps, selectedId)
      streamsRef.current.push(display)
      const settings = display.getVideoTracks()[0]?.getSettings()
      const nativeW = settings?.width ?? fallbackWidth
      const nativeH = settings?.height ?? fallbackHeight
      const scale = nativeW / window.innerWidth

      // Region mode always goes through the canvas (it has to, to crop). Full-screen
      // does too whenever this source can be annotated, so the pencil works at any
      // moment — MediaRecorder can't swap its video track after start(), so the route
      // can't be added later. Sources that can't be annotated keep the zero-copy path.
      const frame = { w: nativeW, h: nativeH }
      // Encode at logical size, not the Retina device pixels the capture arrives in —
      // see encodeSize for why that costs so much. The zero-copy path can't resize
      // (nothing redraws its frames), so it stays native.
      const source = regionMode && box ? { w: box.w * scale, h: box.h * scale } : frame
      const out = encodeSize(source.w, source.h, scale)
      const recordStream =
        regionMode && box
          ? buildCanvasVideo(display, box, scale, fps, frame, out)
          : annotatable
            ? buildCanvasVideo(display, null, scale, fps, frame, out)
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
      // Bitrate follows whatever actually gets encoded: the downscaled canvas on either
      // canvas route, the untouched native frame on the zero-copy one.
      const viaCanvas = Boolean((regionMode && box) || annotatable)
      const encodeW = viaCanvas ? out.w : nativeW
      const encodeH = viaCanvas ? out.h : nativeH
      const rec = new MediaRecorder(recordStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: targetBitrate(encodeW, encodeH, fps)
      })
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
