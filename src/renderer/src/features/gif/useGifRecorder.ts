import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { AnnotationOptions, Phase, Pt, Rect } from '../record/types'
import type { QualityPreset } from '../record/quality'
import { useMarkers } from '../record/useMarkers'
import { useRecordingPointer } from '../record/useRecordingPointer'
import { encodeSize } from '../record/encodeSize'
import { DEFAULT_QUALITY, qualitySettings } from '../record/quality'
import { createMp4Encoder, type Mp4Encoder } from '../record/mp4Encoder'
import { drawAnnotations } from '../annotate-live/composite'
import { gifEncodeSize } from './gifSize'
import { createGifWriter, type GifWriter } from './gifWriter'
import { useLatestRef } from '@renderer/lib/useLatestRef'
import { errorMessage as msg } from '@renderer/lib/errorMessage'

const MIN_REGION = 8

/**
 * Output format for a silent capture.
 *
 * `mp4` is the default because GIF cannot come close on size — it has no lossy transform,
 * no motion compensation and a 256-colour palette per frame. Measured on identical frames at
 * the same resolution, an already-optimised GIF took 661 KB at SSIM 0.9631 where H.264
 * managed 110 KB at a *better* 0.9741. `gif` remains for destinations that require the
 * format outright.
 */
export type SilentFormat = 'mp4' | 'gif'

/** Everything the recorder needs to start a silent capture (no audio in either format). */
export type GifParams = {
  selectedId: string
  fps: number
  regionMode: boolean
  box: Rect | null
  fallbackWidth: number
  format: SilentFormat
  quality?: QualityPreset
}

export type GifRecorder = {
  phase: Phase
  elapsed: number
  markerCount: number
  onMark: () => void
  saving: boolean
  error: string | null
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onPillMouseDown: (e: ReactMouseEvent) => void
  start: (params: GifParams) => Promise<void>
  stop: () => void
}

/**
 * Silent-capture engine: acquires the display stream (no audio), draws the optionally
 * region-cropped frames onto a canvas, and encodes either to MP4 via WebCodecs (see
 * mp4Encoder) or to a GIF via gifenc (see gifWriter).
 *
 * The two differ in more than the encoder. MP4 uses the video path's sizing, which floors
 * the long edge at OBS-grade resolution; GIF is capped at 1024 instead, because its size
 * tracks pixel count almost linearly. GIF also needs the frame pixels read back from the
 * canvas each tick, while the MP4 encoder pulls frames from the canvas itself.
 *
 * Mirrors useRecorder's lifecycle and elapsed timer; the Stop-pill / click-through behaviour
 * is shared via useRecordingPointer.
 */
export function useGifRecorder({ drawMode, getAnnotationCanvas }: AnnotationOptions): GifRecorder {
  const [phase, setPhase] = useState<Phase>('setup')
  const [elapsed, setElapsed] = useState(0)
  const markers = useMarkers()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const streamsRef = useRef<MediaStream[]>([])
  const gifRef = useRef<GifWriter | null>(null)
  const mp4Ref = useRef<Mp4Encoder | null>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)

  const { pillPos, pillRef, onPillMouseDown } = useRecordingPointer(phase, drawMode)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const drawModeRef = useLatestRef(drawMode)
  // Held in a ref so the long-lived rAF encode loop never closes over a stale getter.
  const annoRef = useLatestRef(getAnnotationCanvas)

  const cleanupStreams = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    // Only set here when tearing down without saving; finalize() clears it before flushing.
    mp4Ref.current?.abort()
    mp4Ref.current = null
    gifRef.current = null
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
  }

  const finalize = async (): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    window.clearInterval(timerRef.current)
    // Stop drawing before flushing so no frame is handed to a closing encoder.
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    const gif = gifRef.current
    const mp4 = mp4Ref.current
    gifRef.current = null
    mp4Ref.current = null

    try {
      if (mp4) {
        const bytes = await mp4.finish()
        cleanupStreams()
        await window.snapit.saveRecording(bytes.slice().buffer, 'mp4', markers.read())
        return
      }
      if (gif && gif.frameCount() > 0) {
        const bytes = gif.finish()
        cleanupStreams()
        // Copy into a tightly-bounded ArrayBuffer so the main process's
        // `instanceof ArrayBuffer` guard accepts it over IPC.
        await window.snapit.saveGif(bytes.slice().buffer, markers.read())
        return
      }
      cleanupStreams()
      window.snapit.closeOverlay()
    } catch (e) {
      console.error('[snapit] silent capture save failed:', msg(e))
      cleanupStreams()
      savingRef.current = false
      setSaving(false)
      setError(`Could not save the recording: ${msg(e)}`)
    }
  }

  const stop = (): void => {
    if (phaseRef.current === 'recording') void finalize()
    else window.snapit.closeOverlay()
  }

  // The gif hotkey (pressed again) or Esc stops & saves; in setup it cancels.
  useEffect(() => {
    const off = window.snapit.onStopRecording(() => stop())
    const offMark = window.snapit.onMarkRequest(() => {
      if (phaseRef.current === 'recording') markers.mark()
    })
    const onKey = (e: KeyboardEvent): void => {
      // Draw mode owns Escape (clear, then exit) — see useRecorder for the rationale.
      if (e.key === 'Escape' && !drawModeRef.current) stop()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      offMark()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => () => cleanupStreams(), [])

  const getDisplayStream = async (frameRate: number, sourceId: string): Promise<MediaStream> => {
    await window.snapit.prepareRecording(false, sourceId)
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate }, audio: false })
  }

  /** Wait until the off-screen video element reports real dimensions. */
  const waitForVideo = (video: HTMLVideoElement): Promise<void> =>
    new Promise((resolve) => {
      if (video.videoWidth > 0) return resolve()
      video.onloadedmetadata = (): void => resolve()
    })

  const start = async (params: GifParams): Promise<void> => {
    setError(null)
    const { selectedId, fps, regionMode, box, fallbackWidth, format } = params
    const quality = params.quality ?? DEFAULT_QUALITY
    const { videoLongEdge, gifLongEdge, gifTolerance } = qualitySettings(quality)
    if (regionMode && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    try {
      const display = await getDisplayStream(fps, selectedId)
      streamsRef.current.push(display)
      const track = display.getVideoTracks()[0]
      const settings = track?.getSettings()
      const nativeW = settings?.width ?? fallbackWidth
      const scale = nativeW / window.innerWidth

      const video = document.createElement('video')
      video.srcObject = new MediaStream([track])
      video.muted = true
      await video.play()
      await waitForVideo(video)

      // Source crop rect in native pixels.
      const sx = regionMode && box ? Math.round(box.x * scale) : 0
      const sy = regionMode && box ? Math.round(box.y * scale) : 0
      const sw = regionMode && box ? Math.round(box.w * scale) : video.videoWidth
      const sh = regionMode && box ? Math.round(box.h * scale) : video.videoHeight

      // Neither format encodes the 2x Retina device buffer — that is 4x the pixels. MP4 uses
      // the video path's sizing; GIF is capped harder, since its size tracks pixel count
      // almost linearly (see gifEncodeSize).
      const { w: outW, h: outH } =
        format === 'gif'
          ? gifEncodeSize(sw, sh, scale, gifLongEdge)
          : encodeSize(sw, sh, scale, videoLongEdge)

      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('2D canvas context unavailable')
      // High-quality resampling for the Retina 2x → 1x downscale.
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      if (format === 'gif') gifRef.current = createGifWriter(outW, outH, gifTolerance)
      else
        mp4Ref.current = await createMp4Encoder({
          canvas,
          width: outW,
          height: outH,
          fps,
          audioTrack: null,
          quality
        })

      /** Draw the current video frame, with annotations burnt in, into the canvas. */
      const drawNow = (): void => {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
        // Burn annotations in *before* any read-back, so they're part of the frame that gets
        // encoded rather than a separate overlay.
        drawAnnotations(ctx, annoRef.current(), regionMode && box ? box : null, outW, outH)
      }

      // Throttle to the target fps. GIF uses the *measured* interval as each frame's delay,
      // so it plays back in real time even if encoding falls behind; MP4 carries a real
      // timestamp instead. `encoding` skips a tick while the MP4 encoder is still busy, so a
      // slow encode can't queue frames without bound.
      const minInterval = 1000 / fps
      const startedAt = performance.now()
      let lastDraw = 0
      let encoding = false
      const draw = (now: number): void => {
        rafRef.current = requestAnimationFrame(draw)
        if (lastDraw === 0) lastDraw = now
        const dt = now - lastDraw
        if (encoding || dt < minInterval) return
        lastDraw = now
        drawNow()

        const gifWriter = gifRef.current
        if (gifWriter) {
          gifWriter.addFrame(ctx.getImageData(0, 0, outW, outH).data, Math.round(dt))
          return
        }
        const encoder = mp4Ref.current
        if (!encoder) return
        encoding = true
        void encoder
          .addFrame((performance.now() - startedAt) / 1000)
          .catch((e) => {
            console.error(`[snapit] frame encode failed: ${msg(e)}`)
            setError(`Recording failed: ${msg(e)}`)
          })
          .finally(() => {
            encoding = false
          })
      }
      rafRef.current = requestAnimationFrame(draw)

      const t0 = Date.now()
      markers.begin(t0)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    } catch (e) {
      setError(`Could not start GIF recording: ${msg(e)}`)
      setPhase('setup')
    }
  }

  return {
    phase,
    elapsed,
    markerCount: markers.markers.length,
    onMark: markers.mark,
    saving,
    error,
    pillPos,
    pillRef,
    onPillMouseDown,
    start,
    stop
  }
}
