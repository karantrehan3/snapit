import { readAnalytics } from './analyticsSource'
import { assertInside, deleteCapture, listLibrary, renameCapture, thumbnailFor } from './library'
import { setCaptureMarkers } from './markerStore'
import type { CaptureId, CaptureLocation, CaptureStore } from './captureStore'

/**
 * The save folder, behind `CaptureStore`.
 *
 * Deliberately thin. Every function it calls already existed and is unchanged — this adds
 * an interface, not a layer, and the behaviour it produces is what shipped in 4.0.0. If
 * this file ever grows logic of its own, that logic is missing from the connected
 * implementation.
 *
 * `saveDir` is read per call rather than captured, because Settings can change it while
 * the app is running and a store holding a stale folder would quietly list the wrong one.
 */
export function createLocalCaptureStore(saveDir: () => string): CaptureStore {
  /**
   * Every id crossing IPC is re-checked against the save folder.
   *
   * It arrived from the renderer, and the operations below rename and delete. A path that
   * escapes means something is wrong rather than something is unusual, so `assertInside`
   * refuses rather than clamping.
   */
  const inside = (id: CaptureId): string => assertInside(saveDir(), id)

  return {
    mode: 'local',

    list: () => listLibrary(saveDir()),

    async thumbnail(id) {
      try {
        return await thumbnailFor(inside(id))
      } catch {
        // A capture outside the folder, or one the OS cannot render. The tile is designed
        // to work without one.
        return null
      }
    },

    analytics: () => readAnalytics(saveDir()),

    rename: (id, name) => renameCapture(saveDir(), id, name),

    setMarkers: (id, markers) => setCaptureMarkers(saveDir(), id, markers),

    remove: (id) => deleteCapture(saveDir(), id),

    async locate(id): Promise<CaptureLocation> {
      return { kind: 'path', path: inside(id) }
    }
  }
}
