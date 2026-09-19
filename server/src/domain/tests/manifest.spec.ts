import { describe, expect, test } from 'vitest'
import { buildManifest, environmentLine, type ArtifactRecord } from '../manifest.ts'

const FALLBACK = '2026-09-19T09:00:00.000Z'

const artifacts: ArtifactRecord[] = [
  { name: 'report.html', role: 'report', bytes: 98_000, contentType: 'text/html' },
  { name: 'snapit-2026-09-19.mp4', role: 'media', bytes: 160_000_000, contentType: 'video/mp4' },
  { name: 'network.har', role: 'data', bytes: 412_000, contentType: 'application/json' }
]

/** The shape snapit 4.0.0 actually writes, trimmed to the fields the server reads. */
const realMeta = {
  schema: 1,
  capturedAt: '2026-09-19T14:02:11.482Z',
  app: { name: 'snapit', version: '4.0.0' },
  system: {
    platform: 'darwin',
    release: '25.6.0',
    arch: 'arm64',
    locale: 'en-GB',
    timeZone: 'Europe/London'
  },
  displays: [],
  capture: {
    kind: 'browser-session',
    durationMs: 92_400,
    hasSystemAudio: false,
    source: null,
    markers: [
      { atMs: 12_000, note: 'here' },
      { atMs: 41_000, note: '' }
    ]
  },
  media: { file: 'snapit-2026-09-19.mp4', bytes: 160_000_000, ext: 'mp4' },
  collected: { console: 300, consoleErrors: 4, requests: 210, failedRequests: 2, actions: 17, navigations: 3 }
}

describe('building a manifest from real metadata', () => {
  test('reads the fields a listing and a ticket need', () => {
    expect(buildManifest({ meta: realMeta, artifacts, fallbackCapturedAt: FALLBACK })).toEqual({
      kind: 'browser-session',
      capturedAt: '2026-09-19T14:02:11.482Z',
      durationMs: 92_400,
      counts: { consoleErrors: 4, failedRequests: 2, actions: 17, markers: 2 },
      environment: {
        platform: 'darwin',
        release: '25.6.0',
        arch: 'arm64',
        appVersion: '4.0.0',
        locale: 'en-GB',
        timeZone: 'Europe/London'
      },
      mediaName: 'snapit-2026-09-19.mp4',
      artifacts
    })
  })
})

describe('metadata the server cannot trust', () => {
  test.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'not metadata'],
    ['an array', []],
    ['an empty object', {}],
    ['capture: null — passes a key check, throws on first field read', { capture: null }],
    [
      'fields of the wrong type',
      {
        capturedAt: 7,
        capture: { kind: [], durationMs: 'long', markers: 'two' },
        collected: { consoleErrors: '4' }
      }
    ]
  ])('survives %s rather than rejecting the capture', (_label, meta) => {
    const manifest = buildManifest({ meta, artifacts, fallbackCapturedAt: FALLBACK })
    expect(manifest.counts).toEqual({ consoleErrors: 0, failedRequests: 0, actions: 0, markers: 0 })
    expect(manifest.capturedAt).toBe(FALLBACK)
    // The media still comes through, because it came from the upload and not the metadata.
    expect(manifest.mediaName).toBe('snapit-2026-09-19.mp4')
  })

  test('an unparseable capturedAt falls back rather than producing Invalid Date', () => {
    const manifest = buildManifest({
      meta: { capturedAt: 'yesterday' },
      artifacts,
      fallbackCapturedAt: FALLBACK
    })
    expect(manifest.capturedAt).toBe(FALLBACK)
  })

  test('a negative duration is reported as unknown, not as a negative', () => {
    const meta = { capture: { durationMs: -1 } }
    expect(buildManifest({ meta, artifacts, fallbackCapturedAt: FALLBACK }).durationMs).toBeNull()
  })
})

describe('media', () => {
  test('names the media the bucket holds, not the one metadata claims', () => {
    // A `meta.json` naming a file that was never uploaded would point the viewer at a 404.
    const manifest = buildManifest({
      meta: { ...realMeta, media: { file: 'never-uploaded.mp4', bytes: 1, ext: 'mp4' } },
      artifacts,
      fallbackCapturedAt: FALLBACK
    })
    expect(manifest.mediaName).toBe('snapit-2026-09-19.mp4')
  })

  test('a session with no media is not mistaken for a recording', () => {
    const noMedia = artifacts.filter((a) => a.role !== 'media')
    const manifest = buildManifest({ meta: {}, artifacts: noMedia, fallbackCapturedAt: FALLBACK })
    expect(manifest.mediaName).toBeNull()
    expect(manifest.kind).toBe('unknown')
  })
})

describe('environmentLine', () => {
  test('reads as one line in a ticket', () => {
    const manifest = buildManifest({ meta: realMeta, artifacts, fallbackCapturedAt: FALLBACK })
    expect(environmentLine(manifest)).toBe('darwin 25.6.0 (arm64) · snapit 4.0.0')
  })

  test('says unknown rather than printing an empty string', () => {
    expect(environmentLine(buildManifest({ meta: {}, artifacts: [], fallbackCapturedAt: FALLBACK }))).toBe(
      'unknown'
    )
  })
})
