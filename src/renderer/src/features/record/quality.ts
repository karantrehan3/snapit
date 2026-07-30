/**
 * Recording quality presets, shared by the video and silent (MP4/GIF) recorders.
 *
 * Every number here was measured rather than guessed, at 1920x1246/30fps on real screen
 * content against a lossless reference.
 *
 * H.264 constant quality (`quantizer`), where SSIM barely moves while size nearly halves:
 *   QP30 → 927 kbps @ 0.9978   QP33 → 808 @ 0.9967
 *   QP36 → 677 kbps @ 0.9949   QP39 → 571 @ 0.9914
 *
 * GIF delta tolerance, at 1024 wide — quality is flat across a wide band, so the size
 * difference is nearly free until it isn't:
 *   tol 10 → 1915 KB @ 0.9657   tol 14 → 1028 @ 0.9542   tol 16 → 809 @ 0.9543
 *   tol 18 →  661 KB @ 0.9531   tol 20 →  589 @ 0.9474
 *
 * Resolution is the other axis, and it bites GIF far harder than video: GIF size tracks pixel
 * count almost linearly (1512 wide cost 4240 KB where 1024 cost 1915 KB), while H.264 absorbs
 * extra pixels comparatively cheaply. Hence the separate long-edge targets per format.
 */
export type QualityPreset = 'high' | 'balanced' | 'small'

export type QualitySettings = {
  /** Shown on the control. */
  label: string
  /** One line explaining the trade, shown under the label. */
  hint: string
  /** H.264 quantizer for constant-quality mode: 0 is lossless, 51 is worst. */
  quantizer: number
  /**
   * Bits per pixel per second, used only when the platform has no quantizer mode (no
   * GPU-backed encoder). A ceiling, not a target — easy content spends far less.
   */
  bitsPerPixel: number
  /** Long edge to aim for when encoding MP4. */
  videoLongEdge: number
  /** Long edge a GIF is capped at. GIF is never scaled *up* to reach it. */
  gifLongEdge: number
  /** Max per-channel drift for a GIF pixel to count as unchanged (and so stay transparent). */
  gifTolerance: number
}

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  high: {
    label: 'High',
    hint: 'Sharpest text, largest files',
    quantizer: 30,
    bitsPerPixel: 0.02,
    videoLongEdge: 2560,
    gifLongEdge: 1280,
    gifTolerance: 12
  },
  balanced: {
    label: 'Balanced',
    hint: 'Matches OBS-grade size and clarity',
    quantizer: 36,
    bitsPerPixel: 0.012,
    videoLongEdge: 1920,
    gifLongEdge: 1024,
    gifTolerance: 18
  },
  small: {
    label: 'Small',
    hint: 'Easiest to share, softer detail',
    quantizer: 40,
    bitsPerPixel: 0.008,
    videoLongEdge: 1280,
    gifLongEdge: 720,
    gifTolerance: 24
  }
}

/** Order to present the presets in, best first. */
export const QUALITY_ORDER: QualityPreset[] = ['high', 'balanced', 'small']

/**
 * Default. 'balanced' targets the size and clarity OBS achieves on the same content, which is
 * the bar users compare against.
 */
export const DEFAULT_QUALITY: QualityPreset = 'balanced'

/** Settings for a preset, falling back to the default for an unrecognised value. */
export function qualitySettings(preset: QualityPreset): QualitySettings {
  return QUALITY_PRESETS[preset] ?? QUALITY_PRESETS[DEFAULT_QUALITY]
}
