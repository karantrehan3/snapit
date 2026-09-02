import { describe, it, expect } from 'vitest'
import type { LibraryEntry } from '@preload/index'
import {
  applyFilter,
  dayLabel,
  filterCounts,
  isGif,
  resolveSelection,
  groupByDay,
  humanBytes,
  humanDuration,
  metaLine,
  relativeTime,
  tileFacts
} from '@renderer/lib/capture'

const NOW = new Date('2026-08-25T14:00:00')

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  path: '/save/snapit-a',
  name: 'snapit-a',
  kind: 'recording',
  capturedAt: '2026-08-25T09:00:00',
  bytes: 1_572_864,
  durationMs: 64_000,
  mediaPath: '/save/snapit-a/snapit-a.mp4',
  reportPath: '/save/snapit-a/report.html',
  consoleErrors: 0,
  failedRequests: 0,
  steps: 0,
  markers: 0,
  ...over
})

describe('dayLabel', () => {
  it('names today and yesterday by the calendar, not by elapsed hours', () => {
    // 20 hours earlier is still "yesterday" when it falls the other side of midnight.
    expect(dayLabel('2026-08-25T01:00:00', NOW)).toBe('Today')
    expect(dayLabel('2026-08-24T18:00:00', NOW)).toBe('Yesterday')
  })

  it('uses the weekday inside the last week, which is how people refer to it', () => {
    expect(dayLabel('2026-08-22T10:00:00', NOW)).toMatch(/day$/)
  })

  it('falls back to a date once a weekday stops being a useful handle', () => {
    expect(dayLabel('2026-07-04T10:00:00', NOW)).toMatch(/July/)
  })

  it('names the year only when it is not this one', () => {
    expect(dayLabel('2026-01-04T10:00:00', NOW)).not.toMatch(/2026/)
    expect(dayLabel('2025-01-04T10:00:00', NOW)).toMatch(/2025/)
  })

  it('says so rather than throwing when the timestamp is unreadable', () => {
    expect(dayLabel('not a date', NOW)).toBe('Unknown date')
  })
})

describe('groupByDay', () => {
  it('groups consecutive runs and keeps the order it was given', () => {
    const groups = groupByDay(
      [
        entry({ path: '1', capturedAt: '2026-08-25T11:00:00' }),
        entry({ path: '2', capturedAt: '2026-08-25T09:00:00' }),
        entry({ path: '3', capturedAt: '2026-08-24T09:00:00' })
      ],
      NOW
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
    expect(groups[0].entries.map((e) => e.path)).toEqual(['1', '2'])
  })

  it('does not merge a day that comes back later in the list', () => {
    // Merging would silently reorder captures; the list arrives sorted and stays that way.
    const groups = groupByDay(
      [
        entry({ path: '1', capturedAt: '2026-08-25T11:00:00' }),
        entry({ path: '2', capturedAt: '2026-08-24T09:00:00' }),
        entry({ path: '3', capturedAt: '2026-08-25T08:00:00' })
      ],
      NOW
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Today'])
  })

  it('has nothing to group when there is nothing', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })
})

describe('humanBytes', () => {
  it('scales to a unit someone can read at a glance', () => {
    expect(humanBytes(512)).toBe('512 B')
    expect(humanBytes(1_572_864)).toBe('1.5 MB')
    expect(humanBytes(20 * 1024 * 1024)).toBe('20 MB')
  })

  it('says nothing rather than something wrong', () => {
    expect(humanBytes(-1)).toBe('')
    expect(humanBytes(NaN)).toBe('')
  })
})

describe('humanDuration', () => {
  it('reads as a clock', () => {
    expect(humanDuration(64_000)).toBe('1:04')
    expect(humanDuration(0)).toBe('0:00')
  })

  it('is empty for a capture that has no duration', () => {
    // A screenshot has none and must not claim one.
    expect(humanDuration(null)).toBe('')
  })
})

describe('metaLine', () => {
  it('carries only the facts a capture actually has', () => {
    expect(metaLine(entry({ kind: 'screenshot', durationMs: null, bytes: 245_760 }))).toBe(
      'Screenshot · 240 KB'
    )
  })

  it('names steps and markers when there are any', () => {
    const line = metaLine(entry({ steps: 4, markers: 1 }))
    expect(line).toContain('4 steps')
    expect(line).toContain('1 marker')
  })
})

describe('applyFilter', () => {
  const entries = [
    entry({ path: 'clean' }),
    entry({ path: 'broken', consoleErrors: 2 }),
    entry({ path: 'failed', failedRequests: 1 }),
    entry({ path: 'session', kind: 'session', mediaPath: null, steps: 6 })
  ]

  it('shows everything by default', () => {
    expect(applyFilter(entries, 'all')).toHaveLength(4)
  })

  it('narrows to captures that found something', () => {
    expect(applyFilter(entries, 'problems').map((e) => e.path)).toEqual(['broken', 'failed'])
  })

  it('counts a recording with a trail as a web session too', () => {
    // A merged bundle is a recording by kind but was collected from a browser, and
    // someone looking for "the web ones" means that as well.
    expect(applyFilter(entries, 'session').map((e) => e.path)).toEqual(['session'])
    expect(applyFilter([entry({ path: 'merged', steps: 3 })], 'session')).toHaveLength(1)
  })

  it('does not mutate what it was given', () => {
    const original = [...entries]
    applyFilter(entries, 'problems')
    expect(entries).toEqual(original)
  })

  it('separates the four things the folder actually holds', () => {
    const mixed = [
      entry({ path: 'video', mediaPath: '/save/a/a.mp4' }),
      entry({ path: 'gif', mediaPath: '/save/b/b.gif' }),
      entry({ path: 'shot', kind: 'screenshot', mediaPath: '/save/c.png' }),
      entry({ path: 'web', mediaPath: '/save/d/d.mp4', steps: 4 })
    ]
    expect(applyFilter(mixed, 'recording').map((e) => e.path)).toEqual(['video'])
    expect(applyFilter(mixed, 'gif').map((e) => e.path)).toEqual(['gif'])
    expect(applyFilter(mixed, 'screenshot').map((e) => e.path)).toEqual(['shot'])
    expect(applyFilter(mixed, 'session').map((e) => e.path)).toEqual(['web'])
  })

  it('reads a GIF off its container, since the library calls it a recording', () => {
    // kindFor only separates stills, so kind cannot tell these apart — and a GIF has no
    // sound, no seeking and no report worth reading.
    expect(isGif(entry({ mediaPath: '/save/a/a.gif' }))).toBe(true)
    expect(isGif(entry({ mediaPath: '/save/a/a.GIF' }))).toBe(true)
    expect(isGif(entry({ mediaPath: '/save/a/a.mp4' }))).toBe(false)
    expect(isGif(entry({ mediaPath: null }))).toBe(false)
    // A folder with a dot in its name and no media must not read as a GIF.
    expect(isGif(entry({ mediaPath: null, path: '/save/v1.2/gif' }))).toBe(false)
  })
})

describe('tileFacts', () => {
  it('splits the facts so a 212px tile does not truncate them', () => {
    const facts = tileFacts(entry({ steps: 13, markers: 2 }))
    expect(facts.what).toBe('Recording · 1:04 · 13 steps')
    expect(facts.detail).toContain('1.5 MB')
    expect(facts.detail).toContain('2 markers')
  })

  it('says nothing a still does not have', () => {
    const facts = tileFacts(entry({ kind: 'screenshot', durationMs: null, bytes: 240_000 }))
    expect(facts.what).toBe('Screenshot')
    expect(facts.detail).toContain('234 KB')
  })
})

describe('filterCounts', () => {
  it('counts every chip, so one that would empty the list says so first', () => {
    const counts = filterCounts([
      entry({ path: 'video' }),
      entry({ path: 'gif', mediaPath: '/save/b/b.gif' }),
      entry({ path: 'broken', consoleErrors: 1 })
    ])
    expect(counts.all).toBe(3)
    expect(counts.recording).toBe(2)
    expect(counts.gif).toBe(1)
    expect(counts.problems).toBe(1)
    expect(counts.screenshot).toBe(0)
  })
})

describe('resolveSelection', () => {
  const listed = [entry({ path: 'newest' }), entry({ path: 'older' })]

  it('opens the newest when nothing is selected', () => {
    expect(resolveSelection({ shown: listed, listed, selected: null, pending: null }).selected).toBe('newest')
  })

  it('leaves a valid selection alone', () => {
    expect(resolveSelection({ shown: listed, listed, selected: 'older', pending: null }).selected).toBe(
      'older'
    )
  })

  it('falls back to the newest when the selected capture is gone', () => {
    expect(resolveSelection({ shown: listed, listed, selected: 'deleted', pending: null }).selected).toBe(
      'newest'
    )
  })

  it('holds the selection for a capture the scan has not listed yet', () => {
    // The bug this exists for: a recording saves, snapit asks for it by path, and the
    // folder scan that will include it is still running. Falling back to "newest listed"
    // opened the *previous* capture — and then stayed there, because by the time the scan
    // landed that selection was valid again.
    const held = resolveSelection({ shown: listed, listed, selected: 'older', pending: 'brand-new' })
    expect(held).toEqual({ selected: 'older', pending: 'brand-new' })

    const arrived = [entry({ path: 'brand-new' }), ...listed]
    expect(
      resolveSelection({ shown: arrived, listed: arrived, selected: 'older', pending: 'brand-new' })
    ).toEqual({ selected: 'brand-new', pending: null })
  })

  it('takes a pending capture that is listed but filtered out of view', () => {
    // The caller clears the filter alongside asking, so this only decides which of the
    // two state updates wins — and the answer is the capture that was asked for.
    expect(resolveSelection({ shown: [], listed, selected: null, pending: 'older' })).toEqual({
      selected: 'older',
      pending: null
    })
  })

  it('selects nothing when there is nothing', () => {
    expect(resolveSelection({ shown: [], listed: [], selected: 'gone', pending: null })).toEqual({
      selected: null,
      pending: null
    })
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-03T12:00:00')
  const ago = (ms: number): string => relativeTime(new Date(now.getTime() - ms).toISOString(), now)

  it('answers how long ago, not what time', () => {
    // A clock reading sat two columns from durations like "0:36" and read as one.
    expect(ago(10_000)).toBe('just now')
    expect(ago(18 * 60_000)).toBe('18 minutes ago')
    expect(ago(60 * 60_000)).toBe('1 hour ago')
    expect(ago(5 * 3600_000)).toBe('5 hours ago')
    expect(ago(2 * 86_400_000)).toBe('2 days ago')
  })

  it('hands over to the date once "ago" stops being a handle', () => {
    // Past a week nobody counts days; that is `dayLabel`'s argument and it wins.
    expect(ago(30 * 86_400_000)).toBe(dayLabel(new Date(now.getTime() - 30 * 86_400_000).toISOString(), now))
  })

  it('says something for a clock that is wrong or a date that is not one', () => {
    expect(ago(-60_000)).toBe('just now')
    expect(relativeTime('not a date', now)).toBe('')
  })
})
