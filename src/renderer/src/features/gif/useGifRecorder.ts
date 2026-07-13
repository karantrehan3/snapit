import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import type { Phase, Pt, Rect } from '../record/types'

const MIN_REGION = 8
/** Palette colours per frame; the 256th slot is reserved for transparency on deltas. */
const MAX_COLORS = 255
/** Quantize the palette from every Nth pixel — 4× faster, and plenty for 256 colours. */
const PALETTE_SAMPLE = 4
/** Max per-channel delta (0–255) for a pixel to count as unchanged vs what's already
 * displayed — small enough to catch real edits, large enough to ignore quantization noise. */
const COLOR_TOLERANCE = 10

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Pack a palette entry [r,g,b] into an opaque little-endian RGBA uint32 (matches getImageData). */
const packRgb = (p: number[]): number => ((255 << 24) | (p[2] << 16) | (p[1] << 8) | p[0]) >>> 0

/** Everything the GIF recorder needs to start a capture (no audio — GIFs are silent). */
export type GifParams = {
  selectedId: string
  fps: number
  regionMode: boolean
  box: Rect | null
  fallbackWidth: number
}

export type GifRecorder = {
  phase: Phase
  elapsed: number
  saving: boolean
  error: string | null
  pillPos: Pt | null
  pillRef: RefObject<HTMLDivElement | null>
  onPillMouseDown: (e: ReactMouseEvent) => void
  start: (params: GifParams) => Promise<void>
  stop: () => void
}

/** Build a per-frame palette from a subsample of the frame (rgba4444 keeps an alpha channel
 * so delta frames can map unchanged pixels to a transparent entry). */
function buildPalette(pixels: Uint32Array): number[][] {
  const sampled = new Uint32Array(Math.ceil(pixels.length / PALETTE_SAMPLE))
  for (let i = 0, j = 0; i < pixels.length; i += PALETTE_SAMPLE, j++) sampled[j] = pixels[i]
  return quantize(new Uint8Array(sampled.buffer), MAX_COLORS, { format: 'rgba4444' })
}

/**
 * GIF-recording engine: acquires the display stream (no audio), draws the
 * (optionally region-cropped) frames onto a canvas at the area's on-screen size,
 * and encodes to a GIF incrementally with gifenc. Each frame gets its **own**
 * 256-colour palette (accurate colours for screen UIs — no cross-frame banding).
 * Inter-frame differencing keeps files small: a pixel is written only when it
 * drifts from the *accumulated displayed canvas* (not merely the previous raw
 * frame), which is what avoids ghost trails on scrolling content. Mirrors
 * useRecorder's lifecycle, elapsed timer, and draggable Stop-pill / click-through.
 */
export function useGifRecorder(): GifRecorder {
  const [phase, setPhase] = useState<Phase>('setup')
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pillPos, setPillPos] = useState<Pt | null>(null)

  const phaseRef = useRef<Phase>('setup')
  const streamsRef = useRef<MediaStream[]>([])
  const encoderRef = useRef<ReturnType<typeof GIFEncoder> | null>(null)
  const frameCountRef = useRef(0)
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
    rafRef.current = undefined
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
  }

  const finalize = async (): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    window.clearInterval(timerRef.current)
    cleanupStreams()
    const gif = encoderRef.current
    if (!gif || frameCountRef.current === 0) {
      window.snapit.closeOverlay()
      return
    }
    gif.finish()
    const bytes = gif.bytes()
    // Copy into a tightly-bounded ArrayBuffer so the main process's
    // `instanceof ArrayBuffer` guard accepts it over IPC.
    await window.snapit.saveGif(bytes.slice().buffer)
  }

  const stop = (): void => {
    if (phaseRef.current === 'recording') void finalize()
    else window.snapit.closeOverlay()
  }

  // The gif hotkey (pressed again) or Esc stops & saves; in setup it cancels.
  useEffect(() => {
    const off = window.snapit.onStopRecording(() => stop())
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stop()
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
    const { selectedId, fps, regionMode, box, fallbackWidth } = params
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

      // Encode at the captured area's actual on-screen (logical) size — the
      // resolution you see, not the 2x Retina device buffer. Sharp, matches the
      // screen 1:1, and far smaller/faster than encoding full device pixels.
      const outW = Math.max(1, Math.round(sw / scale))
      const outH = Math.max(1, Math.round(sh / scale))

      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('2D canvas context unavailable')
      // High-quality resampling for the Retina 2x → 1x downscale.
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const gif = GIFEncoder()
      encoderRef.current = gif
      frameCountRef.current = 0

      // The canvas as it will actually be *displayed* (accumulated, post-quantization).
      // Diffing each new frame against this — not against the raw previous frame — is
      // what prevents ghost trails: any pixel that has drifted from what's on screen
      // gets redrawn, while genuinely-static pixels stay transparent (tiny files).
      const shown = new Uint32Array(outW * outH)

      // Throttle to the target fps; use the *measured* interval as each frame's
      // delay so the GIF plays back in real time even if encoding falls behind.
      const minInterval = 1000 / fps
      let lastDraw = 0
      const draw = (now: number): void => {
        if (lastDraw === 0) lastDraw = now
        const dt = now - lastDraw
        if (dt >= minInterval) {
          lastDraw = now
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
          const rgba = ctx.getImageData(0, 0, outW, outH).data
          const cur = new Uint32Array(rgba.buffer)
          const delay = Math.round(dt)
          // Per-frame palette from the current frame — accurate colours, no
          // cross-frame banding. rgba4444 leaves room for a transparent entry.
          const palette = buildPalette(cur)

          if (frameCountRef.current === 0) {
            // First frame: full opaque base layer; seed the displayed canvas from it.
            const index = applyPalette(rgba, palette, 'rgba4444')
            gif.writeFrame(index, outW, outH, { palette, delay, dispose: 1 })
            for (let i = 0; i < index.length; i++) shown[i] = packRgb(palette[index[i]])
          } else {
            // Delta frame: only pixels that visibly differ from what's displayed are
            // written; the rest stay transparent and reveal the canvas beneath.
            palette.push([0, 0, 0, 0])
            const transparentIndex = palette.length - 1
            const delta = new Uint8ClampedArray(rgba)
            const d32 = new Uint32Array(delta.buffer)
            for (let i = 0; i < d32.length; i++) {
              const c = cur[i]
              const s = shown[i]
              const dr = Math.abs((c & 255) - (s & 255))
              const dg = Math.abs(((c >> 8) & 255) - ((s >> 8) & 255))
              const db = Math.abs(((c >> 16) & 255) - ((s >> 16) & 255))
              if (dr <= COLOR_TOLERANCE && dg <= COLOR_TOLERANCE && db <= COLOR_TOLERANCE) d32[i] = 0
            }
            const index = applyPalette(delta, palette, 'rgba4444')
            gif.writeFrame(index, outW, outH, {
              palette,
              delay,
              transparent: true,
              transparentIndex,
              dispose: 1
            })
            // Advance the displayed canvas by the pixels we actually redrew.
            for (let i = 0; i < index.length; i++) {
              if (index[i] !== transparentIndex) shown[i] = packRgb(palette[index[i]])
            }
          }
          frameCountRef.current += 1
        }
        rafRef.current = requestAnimationFrame(draw)
      }
      rafRef.current = requestAnimationFrame(draw)

      const t0 = Date.now()
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    } catch (e) {
      setError(`Could not start GIF recording: ${msg(e)}`)
      setPhase('setup')
    }
  }

  return { phase, elapsed, saving, error, pillPos, pillRef, onPillMouseDown, start, stop }
}
