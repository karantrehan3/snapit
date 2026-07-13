/**
 * Minimal ambient declaration for `gifenc` (the package ships no types).
 * Covers only the surface used by useGifRecorder: build a palette per frame,
 * map pixels to it, write the indexed frame, then read the finished bytes.
 */
declare module 'gifenc' {
  export type Palette = number[][]

  export interface WriteFrameOptions {
    palette?: Palette
    /** Per-frame delay in milliseconds. */
    delay?: number
    /** 1 = do not dispose (leave the frame in place for transparent deltas). */
    dispose?: number
    /** Loop count for the first frame (0 = infinite). */
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
  }

  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoder

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean }
  ): Palette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
  ): Uint8Array
}
