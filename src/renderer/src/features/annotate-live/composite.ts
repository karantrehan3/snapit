import type { Rect } from '../record/types'

/** A `drawImage` source crop + destination size for blitting annotations into a frame. */
export type CompositeCrop = { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number }

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/**
 * Map the full-screen annotation canvas onto a recorder's encode canvas.
 *
 * Three different coordinate spaces meet here, which is why this lives in one
 * tested place rather than at each call site:
 *  - the region `box` is in **logical** CSS pixels (it came from overlay mouse events);
 *  - the annotation canvas is `annoScale` device pixels per logical pixel (Konva
 *    renders at devicePixelRatio, so this is 2 on Retina);
 *  - the destination canvas is logical-sized for GIF but **native**-sized for
 *    region video.
 *
 * Passing the destination size in lets one mapping serve both — `drawImage` does
 * the scaling. The crop is clamped to the screen so a region dragged partly
 * off-screen can't produce an invalid blit.
 */
export function annotationCrop(
  box: Rect | null,
  screenW: number,
  screenH: number,
  destW: number,
  destH: number,
  annoScale: number
): CompositeCrop {
  const x = clamp(box?.x ?? 0, 0, screenW)
  const y = clamp(box?.y ?? 0, 0, screenH)
  const w = Math.max(1, Math.min(box?.w ?? screenW, screenW - x))
  const h = Math.max(1, Math.min(box?.h ?? screenH, screenH - y))
  return {
    sx: x * annoScale,
    sy: y * annoScale,
    sw: w * annoScale,
    sh: h * annoScale,
    dw: destW,
    dh: destH
  }
}

/**
 * Blit the live annotation layer onto a recorder's encode canvas, so annotations
 * land in the file. A no-op when nothing is being annotated.
 *
 * This is the *only* way annotations reach the recording: the overlay window is
 * content-protected while recording (so the tool strip and Stop pill stay off
 * camera), which means the OS capture never sees anything drawn on it.
 *
 * `box` is the region in logical pixels, or null for the full frame. Must be called
 * after the video frame is drawn and before the frame is read back or encoded.
 *
 * IMPORTANT: assumes the encode canvas covers the same screen area the annotation
 * canvas does — i.e. the captured source is the display this overlay is on. For a
 * window capture, or a second display, the frame covers a different area and this
 * would stretch screen-space annotations onto it. Callers gate on the source picker's
 * `canRegion`, which is precisely that condition.
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D | null,
  anno: HTMLCanvasElement | null,
  box: Rect | null,
  destW: number,
  destH: number
): void {
  if (!ctx || !anno || anno.width === 0 || anno.height === 0) return
  // The annotation canvas spans the whole overlay, so its own device-pixel scale is
  // simply its width over the logical viewport width — no need to guess at Konva's
  // pixelRatio.
  const annoScale = anno.width / window.innerWidth
  const c = annotationCrop(box, window.innerWidth, window.innerHeight, destW, destH, annoScale)
  ctx.drawImage(anno, c.sx, c.sy, c.sw, c.sh, 0, 0, c.dw, c.dh)
}
