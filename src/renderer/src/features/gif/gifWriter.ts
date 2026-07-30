import { GIFEncoder, quantize, applyPalette } from 'gifenc'

/**
 * Palette colours per frame; the 256th slot is reserved for transparency on deltas.
 *
 * Do not "optimise" this downwards — it makes files *bigger*, which is counterintuitive
 * enough to be worth recording. Measured on 60 frames of real screen content: 255 colours
 * produced 4241 KB, 128 produced 5324 KB, 64 produced 6053 KB and 32 produced 7012 KB. A
 * coarser palette makes more pixels quantize to something other than what is already
 * displayed, so the delta below finds more changed pixels, fewer stay transparent, and the
 * banding it introduces breaks up the runs LZW relies on.
 */
const MAX_COLORS = 255

/** Quantize the palette from every Nth pixel — 4× faster, and plenty for 256 colours. */
const PALETTE_SAMPLE = 4

/** Pack a palette entry [r,g,b] into an opaque little-endian RGBA uint32 (matches getImageData). */
const packRgb = (p: number[]): number => ((255 << 24) | (p[2] << 16) | (p[1] << 8) | p[0]) >>> 0

/** Build a per-frame palette from a subsample of the frame (rgba4444 keeps an alpha channel
 * so delta frames can map unchanged pixels to a transparent entry). */
function buildPalette(pixels: Uint32Array): number[][] {
  const sampled = new Uint32Array(Math.ceil(pixels.length / PALETTE_SAMPLE))
  for (let i = 0, j = 0; i < pixels.length; i += PALETTE_SAMPLE, j++) sampled[j] = pixels[i]
  return quantize(new Uint8Array(sampled.buffer), MAX_COLORS, { format: 'rgba4444' })
}

export type GifWriter = {
  /** Quantize and append one frame. `delayMs` is how long it should be shown. */
  addFrame: (rgba: Uint8ClampedArray, delayMs: number) => void
  /** Frames appended so far. */
  frameCount: () => number
  /** Close the stream and return the encoded GIF. */
  finish: () => Uint8Array
}

/**
 * Incremental GIF encoder for screen recordings.
 *
 * Each frame gets its **own** palette — accurate colours for screen UIs, with no cross-frame
 * banding. Inter-frame differencing is what keeps files small, and the subtlety is what it
 * diffs against: the *accumulated displayed canvas*, not merely the previous raw frame. Any
 * pixel that has drifted from what a viewer is actually seeing gets redrawn, while genuinely
 * static pixels stay transparent. Diffing against the previous raw frame instead leaves
 * ghost trails on scrolling content, because quantization error accumulates unseen.
 *
 * @param tolerance Max per-channel drift (0-255) for a pixel to count as unchanged against
 * what is already displayed, and so stay transparent. The strongest size lever in the
 * encoder: measured at 1024 wide, quality is flat while size falls sharply — tol 10 gave
 * 1915 KB @ SSIM 0.9657, tol 18 gave 661 KB @ 0.9531, and only by tol 20 does quality
 * measurably give way. Comes from the quality preset (see quality.ts). Raising it risks stale
 * pixels (ghosting); drift is bounded by it, since anything exceeding it gets redrawn.
 */
export function createGifWriter(width: number, height: number, tolerance: number): GifWriter {
  const gif = GIFEncoder()
  // The canvas as it will actually be *displayed*: accumulated, post-quantization.
  const shown = new Uint32Array(width * height)
  let frames = 0

  return {
    frameCount: () => frames,

    addFrame: (rgba, delayMs) => {
      const cur = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length / 4)
      const palette = buildPalette(cur)

      if (frames === 0) {
        // First frame: full opaque base layer; seed the displayed canvas from it.
        const index = applyPalette(rgba, palette, 'rgba4444')
        gif.writeFrame(index, width, height, { palette, delay: delayMs, dispose: 1 })
        for (let i = 0; i < index.length; i++) shown[i] = packRgb(palette[index[i]])
      } else {
        // Delta frame: only pixels that visibly differ from what's displayed are written;
        // the rest stay transparent and reveal the canvas beneath.
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
          if (dr <= tolerance && dg <= tolerance && db <= tolerance) d32[i] = 0
        }
        const index = applyPalette(delta, palette, 'rgba4444')
        gif.writeFrame(index, width, height, {
          palette,
          delay: delayMs,
          transparent: true,
          transparentIndex,
          dispose: 1
        })
        // Advance the displayed canvas by the pixels we actually redrew.
        for (let i = 0; i < index.length; i++) {
          if (index[i] !== transparentIndex) shown[i] = packRgb(palette[index[i]])
        }
      }
      frames += 1
    },

    finish: () => {
      gif.finish()
      return gif.bytes()
    }
  }
}
