import { summarise, type Analytics } from './analytics'
import { kindFor, sortEntries, type LibraryEntry } from './libraryEntry'
import type { Marker } from './bundle'
import type { CaptureId, CaptureLocation, CaptureStore } from './captureStore'

/**
 * A workspace on a snapit server, behind the same `CaptureStore` the save folder uses.
 *
 * The renderer cannot tell which one it has, which is the entire point of M3.0. What
 * differs is underneath: identity is a path here rather than a folder, the media is a URL
 * rather than a file, and two operations degrade in ways worth stating rather than hiding.
 */

/** Anything the server can say. See `server/src/http/respond.ts`. */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/** The fields of a server capture this app reads. Deliberately narrow — see `manifest.ts`. */
type RemoteCapture = {
  id: string
  title: string
  status: string
  createdAt: string
  manifest: {
    kind: string
    capturedAt: string
    durationMs: number | null
    counts: { consoleErrors: number; failedRequests: number; actions: number; markers: number }
    mediaName: string | null
    artifacts: Array<{ name: string; role: string; bytes: number }>
  }
}

export type RemoteSession = { serverUrl: string; token: string; workspaceId: string }

/**
 * A server capture as the library shows it.
 *
 * Pure, and exported because it is the half worth testing: it is the join between two
 * record shapes that version independently, and every field it reads arrived over a
 * network from a server that may be a release ahead.
 */
export function entryFromRemote(capture: RemoteCapture): LibraryEntry {
  const manifest = capture.manifest
  const bytes = manifest.artifacts.reduce((total, a) => total + (Number(a.bytes) || 0), 0)
  return {
    // The id is the capture id, not a path. Nothing downstream may assume otherwise, which
    // is why `CaptureId` is documented as opaque.
    path: capture.id,
    name: capture.title,
    kind: manifest.mediaName ? kindFor(manifest.mediaName) : 'session',
    capturedAt: manifest.capturedAt,
    bytes,
    durationMs: manifest.durationMs,
    // Null rather than a URL: these are the app's own file paths, and a remote capture has
    // none. Anything that wants to open one goes through `locate`.
    mediaPath: null,
    reportPath: null,
    consoleErrors: manifest.counts.consoleErrors,
    failedRequests: manifest.counts.failedRequests,
    steps: manifest.counts.actions,
    markers: manifest.counts.markers
  }
}

export function createRemoteCaptureStore(session: () => RemoteSession): CaptureStore {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const { serverUrl, token } = session()
    const res = await fetch(`${serverUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers }
    })
    const envelope = (await res.json().catch(() => null)) as Envelope<T> | null
    if (!envelope) throw new Error(`${path} returned ${res.status} with no JSON body.`)
    if (!envelope.ok) throw new Error(envelope.error.message)
    return envelope.data
  }

  const list = async (): Promise<LibraryEntry[]> => {
    const { workspaceId } = session()
    const { captures } = await call<{ captures: RemoteCapture[] }>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/captures`
    )
    // A capture still uploading has no manifest worth showing, and would render as a
    // zero-length recording.
    return sortEntries(captures.filter((c) => c.status === 'ready').map(entryFromRemote))
  }

  return {
    mode: 'connected',

    list,

    /**
     * No thumbnails yet.
     *
     * Locally these come from the OS thumbnail service reading a file. The server would
     * have to render and store one at upload time — which is the right fix and is a server
     * feature, not something to paper over by downloading a 41 MB recording per tile. The
     * grid is built to work without one.
     */
    async thumbnail() {
      return null
    },

    /**
     * Counts only, and this is a real gap rather than a rounding error.
     *
     * M1.9's whole point is the question DevTools cannot answer — which endpoint failed
     * across more than one capture — and answering it needs every capture's HAR. Locally
     * that is a disk read. Here it would be a download per capture, so it is not done.
     *
     * The fix is server-side: derive the request facts once at `complete`, when the HAR is
     * already in hand, and store them on the capture. Until then the totals, the kinds and
     * the day buckets are real and the endpoint tables are empty.
     */
    async analytics(): Promise<Analytics> {
      const entries = await list()
      return summarise(
        entries.map((e) => ({
          name: e.name,
          kind: e.kind,
          bytes: e.bytes,
          capturedAt: e.capturedAt,
          consoleErrors: e.consoleErrors,
          requests: [],
          knownFailedRequests: e.failedRequests
        }))
      )
    },

    async rename(id: CaptureId, name: string): Promise<CaptureId> {
      await call(`/v1/captures/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: name })
      })
      // The id does not change on a rename, unlike a local path.
      return id
    },

    /** Not a server concept yet: markers live inside a bundle, which the server never opens. */
    async setMarkers(): Promise<Marker[]> {
      throw new Error('Editing markers on a shared capture is not supported yet.')
    },

    async remove(id: CaptureId): Promise<void> {
      await call(`/v1/captures/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async locate(id: CaptureId): Promise<CaptureLocation> {
      const { shareUrl } = await call<{ shareUrl: string }>(`/v1/captures/${encodeURIComponent(id)}`)
      return { kind: 'url', url: shareUrl }
    }
  }
}
