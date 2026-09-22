import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The local store is thin on purpose, so these test the two things thinness does not give
 * for free: that the save folder is read at call time rather than captured, and that an id
 * arriving from the renderer is re-checked before anything renames or deletes with it.
 */

const listLibrary = vi.fn()
const thumbnailFor = vi.fn()
const renameCapture = vi.fn()
const deleteCapture = vi.fn()
const setCaptureMarkers = vi.fn()
const readAnalytics = vi.fn()

/** Stands in for the real one, which refuses anything outside the save folder. */
const assertInside = vi.fn((saveDir: string, path: string) => {
  if (!path.startsWith(saveDir)) throw new Error('That capture is not inside the snapit save folder.')
  return path
})

vi.mock('../library', () => ({ listLibrary, thumbnailFor, renameCapture, deleteCapture, assertInside }))
vi.mock('../markerStore', () => ({ setCaptureMarkers }))
vi.mock('../analyticsSource', () => ({ readAnalytics }))

const { createLocalCaptureStore } = await import('../localCaptures')

const FOLDER = '/Users/someone/Pictures/snapit'
const CAPTURE = `${FOLDER}/Wait Time Demo`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the save folder is read per call', () => {
  test('a folder changed in Settings takes effect without rebuilding the store', async () => {
    // Capturing saveDir at construction is the bug this guards: the store would go on
    // listing the old folder for the rest of the session.
    let folder = FOLDER
    const store = createLocalCaptureStore(() => folder)

    await store.list()
    expect(listLibrary).toHaveBeenLastCalledWith(FOLDER)

    folder = '/Volumes/Work/captures'
    await store.list()
    expect(listLibrary).toHaveBeenLastCalledWith('/Volumes/Work/captures')
  })

  test('analytics follows the folder too', async () => {
    let folder = FOLDER
    const store = createLocalCaptureStore(() => folder)
    await store.analytics()
    expect(readAnalytics).toHaveBeenLastCalledWith(FOLDER)
    folder = '/elsewhere'
    await store.analytics()
    expect(readAnalytics).toHaveBeenLastCalledWith('/elsewhere')
  })
})

describe('ids from the renderer are re-checked', () => {
  const store = createLocalCaptureStore(() => FOLDER)

  test('locate refuses a path outside the save folder', async () => {
    await expect(store.locate('/etc/passwd')).rejects.toThrow(/not inside/)
  })

  test('locate answers with a path for a capture that is inside it', async () => {
    await expect(store.locate(CAPTURE)).resolves.toEqual({ kind: 'path', path: CAPTURE })
  })

  test('a thumbnail outside the folder is null rather than a throw', async () => {
    // The tile is designed to work without one, and a single bad capture must not take
    // down the grid.
    await expect(store.thumbnail('/etc/passwd')).resolves.toBeNull()
    expect(thumbnailFor).not.toHaveBeenCalled()
  })

  test('a thumbnail the OS cannot render is also null', async () => {
    thumbnailFor.mockRejectedValueOnce(new Error('unsupported'))
    await expect(store.thumbnail(CAPTURE)).resolves.toBeNull()
  })
})

describe('delegation', () => {
  const store = createLocalCaptureStore(() => FOLDER)

  test('rename, markers and remove pass the folder and the id straight through', async () => {
    renameCapture.mockResolvedValueOnce(`${FOLDER}/Renamed`)
    await expect(store.rename(CAPTURE, 'Renamed')).resolves.toBe(`${FOLDER}/Renamed`)
    expect(renameCapture).toHaveBeenCalledWith(FOLDER, CAPTURE, 'Renamed')

    setCaptureMarkers.mockResolvedValueOnce([{ atMs: 1, note: 'x' }])
    await expect(store.setMarkers(CAPTURE, [{ atMs: 1, note: 'x' }])).resolves.toEqual([
      { atMs: 1, note: 'x' }
    ])
    expect(setCaptureMarkers).toHaveBeenCalledWith(FOLDER, CAPTURE, [{ atMs: 1, note: 'x' }])

    await store.remove(CAPTURE)
    expect(deleteCapture).toHaveBeenCalledWith(FOLDER, CAPTURE)
  })

  test('reports itself as local, which is what the shell branches on', () => {
    expect(store.mode).toBe('local')
  })
})
