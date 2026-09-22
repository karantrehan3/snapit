/**
 * What the server knows about a capture's contents.
 *
 * This is deliberately *not* the desktop's `CaptureMeta`, and not an import of it. The
 * two version independently — `meta.json` carries `schema: 1` precisely so a later
 * reader can tell what it is looking at — and a server that imports the app's type is a
 * server that has to ship in lockstep with every desktop release. So the app's metadata
 * is treated the way the app treats a bundle on disk: as untrusted input, coerced into a
 * narrow shape, with nothing throwing for one bad field.
 *
 * The rule is the same one `libraryEntry.ts` follows: a capture that exists must still be
 * listable. A manifest that cannot be built from metadata is built from the upload
 * instead, thinly, rather than rejecting the capture.
 *
 * Pure, and the half worth testing: every value here arrived over HTTP from a desktop
 * app the server does not control the version of.
 */

export type ArtifactRecord = {
  /** Bare filename, as it sits in the bundle and in the bucket. */
  name: string
  role: 'report' | 'media' | 'data'
  bytes: number
  contentType: string
}

export type CaptureManifest = {
  /** `recording`, `browser-session`, or `unknown` when metadata could not say. */
  kind: string
  capturedAt: string
  durationMs: number | null
  /** What the desktop counted. Shown in listings and in the Jira and Slack payloads. */
  counts: {
    consoleErrors: number
    failedRequests: number
    actions: number
    markers: number
  }
  environment: {
    platform: string | null
    release: string | null
    arch: string | null
    appVersion: string | null
    locale: string | null
    timeZone: string | null
  }
  /** Bare filename of the playable media, when there is one. */
  mediaName: string | null
  artifacts: ArtifactRecord[]
}

const str = (raw: unknown): string | null => (typeof raw === 'string' && raw.length > 0 ? raw : null)

const count = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0

const iso = (raw: unknown, fallback: string): string => {
  const value = str(raw)
  if (!value) return fallback
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString()
}

/** An object, not merely present — `{ "capture": null }` passes a key check and then throws. */
const obj = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

export type ManifestInput = {
  /** The parsed `meta.json` the desktop uploaded. Anything at all. */
  meta: unknown
  artifacts: ArtifactRecord[]
  /** Used when metadata cannot say when this was captured. */
  fallbackCapturedAt: string
}

export function buildManifest(input: ManifestInput): CaptureManifest {
  const meta = obj(input.meta)
  const capture = obj(meta.capture)
  const system = obj(meta.system)
  const app = obj(meta.app)
  const collected = obj(meta.collected)

  // The manifest's media name comes from the uploaded artifacts, not from metadata:
  // the artifacts are what the bucket actually holds, and a `meta.json` naming a file
  // that was never uploaded would produce a viewer pointing at a 404.
  const uploadedMedia = input.artifacts.find((a) => a.role === 'media') ?? null

  return {
    kind: str(capture.kind) ?? (uploadedMedia ? 'recording' : 'unknown'),
    capturedAt: iso(meta.capturedAt, input.fallbackCapturedAt),
    durationMs:
      typeof capture.durationMs === 'number' && Number.isFinite(capture.durationMs) && capture.durationMs >= 0
        ? Math.round(capture.durationMs)
        : null,
    counts: {
      consoleErrors: count(collected.consoleErrors),
      failedRequests: count(collected.failedRequests),
      actions: count(collected.actions),
      markers: Array.isArray(capture.markers) ? capture.markers.length : 0
    },
    environment: {
      platform: str(system.platform),
      release: str(system.release),
      arch: str(system.arch),
      appVersion: str(app.version),
      locale: str(system.locale),
      timeZone: str(system.timeZone)
    },
    mediaName: uploadedMedia?.name ?? null,
    artifacts: input.artifacts
  }
}

/** `macOS 25.6.0 (arm64) · snapit 4.0.0` — one line, for a ticket. */
export function environmentLine(manifest: CaptureManifest): string {
  const { platform, release, arch, appVersion } = manifest.environment
  const system = [platform, release].filter(Boolean).join(' ')
  const parts = [system && arch ? `${system} (${arch})` : system, appVersion ? `snapit ${appVersion}` : '']
  return parts.filter(Boolean).join(' · ') || 'unknown'
}
