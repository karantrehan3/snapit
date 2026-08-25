import { describe, it, expect } from 'vitest'
import { bundleEntry, fileEntry, kindFor, sortEntries, type LibraryEntry } from '../libraryEntry'

const facts = (over: Record<string, unknown> = {}): Parameters<typeof bundleEntry>[0] => ({
  dir: '/save/snapit-a',
  name: 'snapit-a',
  mediaFile: 'snapit-a.mp4',
  hasReport: true,
  bytes: 2048,
  mtimeMs: Date.parse('2026-08-25T10:00:00.000Z'),
  meta: {
    capturedAt: '2026-08-25T09:00:00.000Z',
    capture: { kind: 'recording', durationMs: 64_000, markers: [{ atMs: 1, note: '' }] },
    collected: { consoleErrors: 2, failedRequests: 1, actions: 4 }
  },
  ...over
})

describe('kindFor', () => {
  it('calls a still a screenshot and everything else a recording', () => {
    expect(kindFor('a.png')).toBe('screenshot')
    expect(kindFor('a.mp4')).toBe('recording')
    // A gif is a short recording, whatever its container says.
    expect(kindFor('a.gif')).toBe('recording')
  })

  it('calls a bundle with no media a session', () => {
    expect(kindFor(null)).toBe('session')
  })
})

describe('bundleEntry', () => {
  it('reads what metadata knows', () => {
    const e = bundleEntry(facts())
    expect(e.capturedAt).toBe('2026-08-25T09:00:00.000Z')
    expect(e.durationMs).toBe(64_000)
    expect(e.consoleErrors).toBe(2)
    expect(e.failedRequests).toBe(1)
    expect(e.steps).toBe(4)
    expect(e.markers).toBe(1)
    expect(e.mediaPath).toContain('snapit-a.mp4')
    expect(e.reportPath).toContain('report.html')
  })

  it('still describes a capture whose metadata is missing', () => {
    // A bundle whose media wrote and whose meta.json did not is still a capture
    // someone has; refusing to list it would hide it from the only place it appears.
    const e = bundleEntry(facts({ meta: null }))
    expect(e.name).toBe('snapit-a')
    expect(e.capturedAt).toBe(new Date(facts().mtimeMs).toISOString())
    expect(e.durationMs).toBeNull()
    expect(e.consoleErrors).toBe(0)
  })

  it('survives metadata written by something else entirely', () => {
    for (const junk of [42, 'nope', [], { capture: null }, { capture: {} }]) {
      expect(() => bundleEntry(facts({ meta: junk }))).not.toThrow()
    }
  })

  it('refuses to invent counts from a malformed collected block', () => {
    const e = bundleEntry(
      facts({ meta: { capture: { durationMs: null, markers: [] }, collected: { consoleErrors: 'lots' } } })
    )
    expect(e.consoleErrors).toBe(0)
  })

  it('has no media path when there is no media', () => {
    const e = bundleEntry(facts({ mediaFile: null }))
    expect(e.mediaPath).toBeNull()
    expect(e.kind).toBe('session')
  })

  it('has no report path when the report never wrote', () => {
    expect(bundleEntry(facts({ hasReport: false })).reportPath).toBeNull()
  })
})

describe('fileEntry', () => {
  it('describes a loose capture from the file alone', () => {
    const e = fileEntry({ path: '/save/shot.png', name: 'shot.png', bytes: 1024, mtimeMs: 0 })
    expect(e.kind).toBe('screenshot')
    expect(e.mediaPath).toBe('/save/shot.png')
    expect(e.reportPath).toBeNull()
    expect(e.durationMs).toBeNull()
  })
})

describe('sortEntries', () => {
  const at = (name: string, capturedAt: string): LibraryEntry => ({
    ...fileEntry({ path: `/save/${name}`, name, bytes: 0, mtimeMs: 0 }),
    capturedAt
  })

  it('puts the newest first', () => {
    expect(
      sortEntries([at('a', '2026-08-01T00:00:00Z'), at('b', '2026-08-25T00:00:00Z')]).map((e) => e.name)
    ).toEqual(['b', 'a'])
  })

  it('breaks ties on name so the order cannot shuffle between reads', () => {
    // A session and the recording taken during it share a timestamp, so ties are normal.
    const same = '2026-08-25T00:00:00Z'
    expect(sortEntries([at('b', same), at('a', same)]).map((e) => e.name)).toEqual(['a', 'b'])
    expect(sortEntries([at('a', same), at('b', same)]).map((e) => e.name)).toEqual(['a', 'b'])
  })

  it('does not mutate what it was given', () => {
    const list = [at('a', '2026-08-01T00:00:00Z'), at('b', '2026-08-25T00:00:00Z')]
    const before = [...list]
    sortEntries(list)
    expect(list).toEqual(before)
  })
})
