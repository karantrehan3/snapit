/**
 * What the capture bar was set to last time, and the rules for trusting it.
 *
 * Its own module because settings.ts imports electron, and this is the half worth
 * testing: these values arrive from the renderer and from a file a previous version
 * wrote, so neither can be taken at face value.
 *
 * Every one of them used to be re-picked on every single capture, and every one is a
 * preference rather than a per-capture decision — nobody wants 60fps on Tuesday and 30
 * on Wednesday. Remembering them is what turns the bar from a form into a confirmation.
 */

export type CapturePrefs = {
  /** 5–60, for the recording bar. */
  fps: number
  /**
   * The silent bar's own rate. Separate because a 60fps GIF is enormous and a 60fps
   * recording is not — one shared number would have quietly changed one of them.
   */
  silentFps: number
  quality: 'high' | 'balanced' | 'small'
  /** Seconds of tail to keep, or null for the whole recording. */
  retroSec: number | null
  systemAudio: boolean
  mic: boolean
  /** What a silent capture writes. */
  silentFormat: 'mp4' | 'gif'
}

const MIN_FPS = 5
const MAX_FPS = 60
/** An hour of tail is far past useful; this is here to bound an untrusted number. */
const MAX_RETRO_SEC = 3600

const QUALITIES = ['high', 'balanced', 'small'] as const
const FORMATS = ['mp4', 'gif'] as const

const coerceFps = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(raw)))
    : fallback

export function defaultCapture(): CapturePrefs {
  return {
    fps: 60,
    silentFps: 30,
    quality: 'balanced',
    retroSec: null,
    systemAudio: true,
    mic: true,
    silentFormat: 'mp4'
  }
}

/**
 * Out-of-range values fall back to the default rather than being clamped into
 * something nobody chose — except fps, where clamping is exactly what the control
 * itself does, so a value just outside the range is a rounding difference, not a lie.
 */
export function coerceCapture(raw: unknown): CapturePrefs {
  const d = defaultCapture()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  const retro = o.retroSec
  return {
    fps: coerceFps(o.fps, d.fps),
    silentFps: coerceFps(o.silentFps, d.silentFps),
    quality: QUALITIES.includes(o.quality as CapturePrefs['quality'])
      ? (o.quality as CapturePrefs['quality'])
      : d.quality,
    // null is a real choice here ("keep everything"), not a missing value.
    retroSec:
      retro === null
        ? null
        : typeof retro === 'number' && Number.isFinite(retro) && retro > 0 && retro <= MAX_RETRO_SEC
          ? Math.round(retro)
          : d.retroSec,
    systemAudio: typeof o.systemAudio === 'boolean' ? o.systemAudio : d.systemAudio,
    mic: typeof o.mic === 'boolean' ? o.mic : d.mic,
    silentFormat: FORMATS.includes(o.silentFormat as CapturePrefs['silentFormat'])
      ? (o.silentFormat as CapturePrefs['silentFormat'])
      : d.silentFormat
  }
}
