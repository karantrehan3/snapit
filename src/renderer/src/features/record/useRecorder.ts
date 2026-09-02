import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { AnnotationOptions, Phase, Pt, Rect, RecordParams } from './types'
import { useMarkers } from './useMarkers'
import { rebaseMarkers } from './markers'
import { useRecordingPointer } from './useRecordingPointer'
import { encodeSize } from './encodeSize'
import { DEFAULT_QUALITY, qualitySettings } from './quality'
import { createMp4Encoder, type Mp4Encoder } from './mp4Encoder'
import { createRetroEncoder } from './retroEncoder'
import { KEEP_EVERYTHING } from './retroBuffer'
import { DEFAULT_RETRO } from './retroWindow'
import { mixAudio } from './audioMix'
import { drawAnnotations } from '../annotate-live/composite'
import { useLatestRef } from '@renderer/lib/useLatestRef'
import { errorMessage as msg } from '@renderer/lib/errorMessage'

const MIN_REGION = 8

export type Recorder = {
  phase: Phase
  elapsed: number
  markerCount: number
  onMark: () => void
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
 * audio), draws it to a canvas — cropped to a region and with annotations burnt in —
 * and encodes that canvas to MP4 via WebCodecs (see mp4Encoder). Owns the recording
 * lifecycle and the elapsed timer; the Stop-pill / click-through behaviour lives in
 * useRecordingPointer.
 *
 * Everything goes through the canvas now. MediaRecorder used to allow a zero-copy path
 * for sources that couldn't be annotated, but the encoder needs a canvas to pull frames
 * from, and the canvas is also where the downscale happens — so the copy pays for itself.
 */
export function useRecorder({ drawMode, getAnnotationCanvas }: AnnotationOptions): Recorder {
  const [phase, setPhase] = useState<Phase>('setup')
  const [elapsed, setElapsed] = useState(0)
  const markers = useMarkers()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const encoderRef = useRef<Mp4Encoder | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)
  const startedAtRef = useRef<number>(0)
  const savingRef = useRef(false)
  const stopRequestedRef = useRef(false)

  const { pillPos, pillRef, onPillMouseDown } = useRecordingPointer(phase, drawMode)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const drawModeRef = useLatestRef(drawMode)
  // Held in a ref so the long-lived rAF copy loop never closes over a stale getter.
  const annoRef = useLatestRef(getAnnotationCanvas)

  const cleanupStreams = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    // Only reached with an encoder still set when we're tearing down without saving
    // (unmount, or a failed start) — finalize() clears the ref before it flushes.
    encoderRef.current?.abort()
    encoderRef.current = null
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
    // Stop drawing before flushing, so no frame is queued after the encoder closes. The
    // audio track must outlive this: mediabunny is still pulling from it until finalize.
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const encoder = encoderRef.current
    encoderRef.current = null
    if (!encoder) {
      cleanupStreams()
      window.snapit.closeOverlay()
      return
    }
    try {
      const mp4 = await encoder.finish()
      cleanupStreams()
      // Copy out of the (possibly larger) backing store so only the MP4 crosses the IPC.
      const offsetMs = encoder.trimOffsetSec() * 1000
      await window.snapit.saveRecording(mp4.slice().buffer, 'mp4', {
        markers: rebaseMarkers(markers.read(), offsetMs),
        durationMs: Math.max(0, Date.now() - startedAtRef.current - offsetMs)
      })
    } catch (e) {
      console.error('[snapit] save failed:', e)
      cleanupStreams()
      savingRef.current = false
      setSaving(false)
      setError(`Could not save the recording: ${msg(e)}`)
    }
  }

  const stop = (): void => {
    // Stop can land while start() is still awaiting the display stream or the encoder, in
    // which case there is nothing to flush yet. Record the intent and let start() unwind,
    // rather than closing the overlay and dropping the recording silently.
    if (!encoderRef.current) {
      // Let start() unwind, but never leave the overlay with no way out: a stop that does
      // nothing is indistinguishable from the app hanging.
      stopRequestedRef.current = true
      cleanupStreams()
      window.snapit.closeOverlay()
      return
    }
    void finalize()
  }

  // The record hotkey (pressed again) or Esc stops & saves; in setup it cancels.
  useEffect(() => {
    const off = window.snapit.onStopRecording(() => {
      if (phaseRef.current === 'recording') stop()
      else window.snapit.closeOverlay()
    })
    const offMark = window.snapit.onMarkRequest(() => {
      if (phaseRef.current === 'recording') markers.mark()
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
      offMark()
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
   * Canvas the display video is drawn into — cropped to `region`, or the whole frame when
   * it is null, scaled to `out`, with annotations composited on top. The encoder pulls its
   * frames straight off this canvas.
   */
  const buildCanvas = (
    display: MediaStream,
    region: Rect | null,
    scale: number,
    frame: { w: number; h: number },
    out: { w: number; h: number }
  ): { canvas: HTMLCanvasElement; drawNow: () => void } => {
    const sx = region ? Math.round(region.x * scale) : 0
    const sy = region ? Math.round(region.y * scale) : 0
    const sw = region ? Math.round(region.w * scale) : frame.w
    const sh = region ? Math.round(region.h * scale) : frame.h
    const canvas = document.createElement('canvas')
    canvas.width = out.w
    canvas.height = out.h
    // alpha: false — the video frame covers the canvas completely every draw, so the
    // destination never needs transparency (annotations still composite over it
    // normally). Skipping the alpha channel makes this per-frame blit cheaper.
    const ctx = canvas.getContext('2d', { alpha: false })
    // High-quality resampling for the Retina 2x → 1x downscale, as the GIF path does.
    if (ctx) ctx.imageSmoothingQuality = 'high'
    const video = document.createElement('video')
    video.srcObject = new MediaStream(display.getVideoTracks())
    video.muted = true
    void video.play()
    const drawNow = (): void => {
      if (region) ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      // Full frame: the scale-only form draws the whole video in, so a track that
      // reports a different size than getSettings() did can't yield a bad crop.
      else ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
      drawAnnotations(ctx, annoRef.current(), region, canvas.width, canvas.height)
    }
    return { canvas, drawNow }
  }

  /**
   * Draw-and-encode loop. rAF can fire at the display's refresh rate (e.g. 120 Hz), so
   * this throttles to the target fps; `encoding` additionally skips a tick while the
   * encoder is still busy, which keeps a slow encode from queueing frames without bound.
   * Timestamps come from the wall clock rather than a frame counter, so a skipped tick
   * shortens the gap instead of desynchronising the audio.
   */
  const runEncodeLoop = (
    drawNow: () => void,
    encoder: Mp4Encoder,
    frameRate: number,
    startedAt: number
  ): void => {
    const minInterval = 1000 / frameRate
    let lastDraw = 0
    let encoding = false
    const tick = (now: number): void => {
      rafRef.current = requestAnimationFrame(tick)
      if (encoding || now - lastDraw < minInterval) return
      lastDraw = now
      drawNow()
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
    rafRef.current = requestAnimationFrame(tick)
  }

  /**
   * The encoder takes one track, so the sources are mixed down to one — at a sample rate
   * we choose rather than the one the audio device happens to be running. See audioMix.
   */
  const oneAudioTrack = (tracks: MediaStreamAudioTrack[]): MediaStreamAudioTrack | null => {
    const mix = mixAudio(tracks)
    if (!mix) return null
    audioCtxRef.current = mix.context
    return mix.track
  }

  /**
   * Reported, not just logged. A recording that came back silent is discovered on
   * playback, by which point the thing being narrated has been and gone.
   */
  const audioLost = (reason: string): void => {
    window.snapit.reportProblem(
      'Recording without sound',
      `snapit could not encode this capture's audio, so it is silent. ${reason}`
    )
  }

  const start = async (params: RecordParams): Promise<void> => {
    setError(null)
    const { selectedId, systemAudio, mic, fps, regionMode, box, fallbackWidth, fallbackHeight } = params
    const quality = params.quality ?? DEFAULT_QUALITY
    const retroWindow = params.retroWindow ?? DEFAULT_RETRO
    const { videoLongEdge } = qualitySettings(quality)
    if (regionMode && (!box || box.w < MIN_REGION || box.h < MIN_REGION)) {
      setError('Drag to select a region first.')
      return
    }
    setPhase('recording')
    stopRequestedRef.current = false
    try {
      const display = await getDisplayStream(systemAudio, fps, selectedId)
      streamsRef.current.push(display)
      const settings = display.getVideoTracks()[0]?.getSettings()
      const nativeW = settings?.width ?? fallbackWidth
      const nativeH = settings?.height ?? fallbackHeight
      const scale = nativeW / window.innerWidth

      const frame = { w: nativeW, h: nativeH }
      // Encode at logical size, not the Retina device pixels the capture arrives in —
      // see encodeSize for why that costs so much.
      const source = regionMode && box ? { w: box.w * scale, h: box.h * scale } : frame
      const out = encodeSize(source.w, source.h, scale, videoLongEdge)
      const { canvas, drawNow } = buildCanvas(display, regionMode && box ? box : null, scale, frame, out)

      const audioTracks: MediaStreamAudioTrack[] = []
      if (systemAudio) audioTracks.push(...display.getAudioTracks())
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(micStream)
          audioTracks.push(...micStream.getAudioTracks())
        } catch (e) {
          // Reported, not just logged. Someone narrating a bug into a microphone that
          // was never opened finds out when they play the recording back, by which
          // point the bug has been and gone.
          console.error('[snapit] microphone unavailable, recording without it:', msg(e))
          window.snapit.reportProblem(
            'Recording without the microphone',
            `snapit could not open it, so this capture has no narration. ${msg(e)}`
          )
        }
      }
      const audio = oneAudioTrack(audioTracks)

      const startPerfMs = performance.now()
      // The buffered encoder defers muxing so the front of the recording can be
      // dropped; the tuned single-shot path stays in charge whenever nothing is
      // being discarded, which is the common case.
      const encoder =
        retroWindow === KEEP_EVERYTHING
          ? await createMp4Encoder({
              canvas,
              width: out.w,
              height: out.h,
              fps,
              audioTrack: audio,
              quality,
              onAudioLost: audioLost
            })
          : await createRetroEncoder({
              canvas,
              width: out.w,
              height: out.h,
              fps,
              audioTrack: audio,
              quality,
              window: retroWindow,
              startPerfMs,
              onAudioLost: audioLost
            })
      // Stop pressed while we were setting up: unwind instead of starting a recording
      // nobody is waiting for.
      if (stopRequestedRef.current) {
        encoder.abort()
        cleanupStreams()
        window.snapit.closeOverlay()
        return
      }
      encoderRef.current = encoder

      const t0 = Date.now()
      startedAtRef.current = t0
      markers.begin(t0)
      runEncodeLoop(drawNow, encoder, fps, performance.now())
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    } catch (e) {
      console.error('[snapit] start failed:', e)
      setError(`Could not start recording: ${msg(e)}`)
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
