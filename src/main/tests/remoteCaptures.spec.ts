import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRemoteCaptureStore, entryFromRemote } from '../remoteCaptures'

/**
 * The remote store's job is to be indistinguishable from the local one to everything above
 * it. So these test the join between two record shapes that version independently — a
 * server capture and a `LibraryEntry` — and the two places where connected mode genuinely
 * cannot do what local does.
 */

const SESSION = { serverUrl: 'https://snapit.corp', token: 'v1.tok', workspaceId: 'ws-1' }

const capture = (over: Record<string, unknown> = {}): never =>
  ({
    id: 'cap-1',
    title: 'Checkout returns 500',
    status: 'ready',
    createdAt: '2026-09-19T14:00:00.000Z',
    manifest: {
      kind: 'browser-session',
      capturedAt: '2026-09-19T14:02:11.000Z',
      durationMs: 92_400,
      counts: { consoleErrors: 4, failedRequests: 2, actions: 17, markers: 1 },
      mediaName: 'snapit.mp4',
      artifacts: [
        { name: 'report.html', role: 'report', bytes: 98_000 },
        { name: 'snapit.mp4', role: 'media', bytes: 41_000_000 }
      ]
    },
    ...over
  }) as never

const ok = (data: unknown): Response => ({ json: async () => ({ ok: true, data }) }) as unknown as Response

afterEach(() => vi.unstubAllGlobals())

describe('entryFromRemote', () => {
  test('produces the shape the library already renders', () => {
    expect(entryFromRemote(capture())).toEqual({
      path: 'cap-1',
      name: 'Checkout returns 500',
      kind: 'recording',
      capturedAt: '2026-09-19T14:02:11.000Z',
      bytes: 41_098_000,
      durationMs: 92_400,
      mediaPath: null,
      reportPath: null,
      consoleErrors: 4,
      failedRequests: 2,
      steps: 17,
      markers: 1
    })
  })

  test('the id is the capture id, not a path', () => {
    // Everything downstream treats `path` as opaque; a remote entry is where that stops
    // being a technicality.
    expect(entryFromRemote(capture()).path).toBe('cap-1')
  })

  test('local file paths are null, because there is no file on this disk', () => {
    const entry = entryFromRemote(capture())
    expect(entry.mediaPath).toBeNull()
    expect(entry.reportPath).toBeNull()
  })

  test('a session with no media is not mistaken for a recording', () => {
    const session = capture({
      manifest: { ...(capture() as never as { manifest: Record<string, unknown> }).manifest, mediaName: null }
    })
    expect(entryFromRemote(session).kind).toBe('session')
  })

  test('sums the artifacts rather than trusting a total', () => {
    const odd = capture({
      manifest: {
        ...(capture() as never as { manifest: Record<string, unknown> }).manifest,
        artifacts: [{ name: 'a', role: 'data', bytes: 'not a number' }]
      }
    })
    expect(entryFromRemote(odd).bytes).toBe(0)
  })
})

describe('list', () => {
  test('sends the bearer token and asks for the session workspace', async () => {
    const fetchMock = vi.fn(async () => ok({ captures: [capture()] }))
    vi.stubGlobal('fetch', fetchMock)

    await createRemoteCaptureStore(() => SESSION).list()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://snapit.corp/v1/workspaces/ws-1/captures')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer v1.tok')
  })

  test('hides a capture that has not finished uploading', async () => {
    // A pending capture has no manifest worth showing and renders as a zero-length
    // recording, which looks like corruption rather than progress.
    vi.stubGlobal('fetch', async () =>
      ok({ captures: [capture(), capture({ id: 'cap-2', status: 'pending' })] })
    )
    const list = await createRemoteCaptureStore(() => SESSION).list()
    expect(list.map((e) => e.path)).toEqual(['cap-1'])
  })

  test("surfaces the server's own refusal rather than a status code", async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ ok: false, error: { code: 'forbidden', message: 'A viewer may not do that.' } })
    }))
    await expect(createRemoteCaptureStore(() => SESSION).list()).rejects.toThrow('A viewer may not do that.')
  })
})

describe('what connected mode cannot do', () => {
  test('analytics keeps the failure counts it knows, rather than reporting zero', async () => {
    // The endpoint tables need every HAR, which would be a download per capture. The
    // totals are known from the manifests and must stay true — a page saying "0 failed"
    // beside a list showing failures is worse than an empty table.
    vi.stubGlobal('fetch', async () => ok({ captures: [capture()] }))
    const a = await createRemoteCaptureStore(() => SESSION).analytics()
    expect(a.captures).toBe(1)
    expect(a.failedRequests).toBe(2)
    expect(a.consoleErrors).toBe(4)
    expect(a.withFindings).toBe(1)
    expect(a.failingEndpoints).toEqual([])
    expect(a.slowest).toEqual([])
  })

  test('thumbnails are absent, not broken', async () => {
    await expect(createRemoteCaptureStore(() => SESSION).thumbnail('cap-1')).resolves.toBeNull()
  })

  test('markers are refused with a reason, not silently dropped', async () => {
    await expect(createRemoteCaptureStore(() => SESSION).setMarkers('cap-1', [])).rejects.toThrow(
      /not supported yet/
    )
  })
})

describe('locate', () => {
  test('answers with the share URL, which is what open can use', async () => {
    vi.stubGlobal('fetch', async () => ok({ shareUrl: 'https://snapit.corp/capture/abc' }))
    await expect(createRemoteCaptureStore(() => SESSION).locate('cap-1')).resolves.toEqual({
      kind: 'url',
      url: 'https://snapit.corp/capture/abc'
    })
  })
})
