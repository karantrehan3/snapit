import { join } from 'path'

/**
 * A capture bundle: the media file plus the context needed to act on it, in one
 * folder. The media keeps the name it would have had as a loose file, so dragging
 * it out of the folder still works.
 *
 * Pure layout + metadata construction, kept free of electron and fs imports so it
 * can be unit-tested in isolation (mirrors filename.ts / region.ts).
 */

export type BundleLayout = {
  dir: string
  /** Absolute path of the media file inside the bundle. */
  mediaPath: string
  /** Bare filename, for referencing the media from report.html. */
  mediaName: string
  metaPath: string
  reportPath: string
}

export function bundleLayout(saveDir: string, base: string, ext: string): BundleLayout {
  const dir = join(saveDir, base)
  const mediaName = `${base}.${ext}`
  return {
    dir,
    mediaPath: join(dir, mediaName),
    mediaName,
    metaPath: join(dir, 'meta.json'),
    reportPath: join(dir, 'report.html')
  }
}

export type DisplayInfo = {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
}

export type CaptureSource = { id: string; name: string; type: 'screen' | 'window' } | null

/** A moment the person recording chose to point at. `note` is reserved for M1.2's text. */
export type Marker = { atMs: number; note: string }

/**
 * Accept only well-formed markers from the renderer, and only those that fall inside
 * the recording — a marker past the end would seek the report's player nowhere.
 */
export function sanitizeMarkers(raw: unknown, durationMs: number | null): Marker[] {
  if (!Array.isArray(raw)) return []
  const limit = durationMs === null ? Number.POSITIVE_INFINITY : durationMs
  return raw
    .filter((m): m is Marker => {
      if (!m || typeof m !== 'object') return false
      const o = m as Record<string, unknown>
      return typeof o.atMs === 'number' && Number.isFinite(o.atMs) && o.atMs >= 0 && o.atMs <= limit
    })
    .slice(0, 100)
    .map((m) => ({ atMs: Math.round(m.atMs), note: typeof m.note === 'string' ? m.note.slice(0, 500) : '' }))
    .sort((a, b) => a.atMs - b.atMs)
}

/**
 * How long the saved file runs. The renderer's figure wins because main only sees the
 * wall clock, which is wrong whenever the front of the recording was discarded — but it
 * crosses IPC, so it is checked like any other untrusted value.
 */
export function resolveDurationMs(reported: unknown, wallClockMs: number | null): number | null {
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) return Math.round(reported)
  return wallClockMs !== null && wallClockMs >= 0 ? wallClockMs : null
}

export type CaptureMeta = {
  /** Schema version, so a later reader can tell what it is looking at. */
  schema: 1
  capturedAt: string
  app: { name: 'snapit'; version: string }
  system: { platform: string; release: string; arch: string; locale: string; timeZone: string }
  displays: DisplayInfo[]
  capture: {
    kind: 'recording'
    /** Null when the recording was stopped without a known start (prepare never ran). */
    durationMs: number | null
    hasSystemAudio: boolean
    source: CaptureSource
    markers: Marker[]
  }
  media: { file: string; bytes: number; ext: string }
}

export type MetaInput = {
  capturedAt: Date
  appVersion: string
  platform: string
  release: string
  arch: string
  locale: string
  timeZone: string
  displays: DisplayInfo[]
  durationMs: number | null
  hasSystemAudio: boolean
  source: CaptureSource
  markers: Marker[]
  mediaName: string
  mediaBytes: number
  ext: string
}

export function buildMeta(input: MetaInput): CaptureMeta {
  return {
    schema: 1,
    capturedAt: input.capturedAt.toISOString(),
    app: { name: 'snapit', version: input.appVersion },
    system: {
      platform: input.platform,
      release: input.release,
      arch: input.arch,
      locale: input.locale,
      timeZone: input.timeZone
    },
    displays: input.displays,
    capture: {
      kind: 'recording',
      // A negative span means the clock moved (sleep, DST); report unknown rather than nonsense.
      durationMs: input.durationMs !== null && input.durationMs >= 0 ? input.durationMs : null,
      hasSystemAudio: input.hasSystemAudio,
      source: input.source,
      markers: input.markers
    },
    media: { file: input.mediaName, bytes: input.mediaBytes, ext: input.ext }
  }
}

/** `1.4 MB` / `812 KB` — for the report, where exact bytes are noise. */
export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** `1:04` / `12:07` — elapsed time, never a bare millisecond count. */
export function humanDuration(ms: number | null): string {
  if (ms === null) return 'unknown'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
