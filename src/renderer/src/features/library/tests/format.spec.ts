import { describe, it, expect } from 'vitest'
import type { LibraryEntry } from '@preload/index'
import { applyFilter, dayLabel, groupByDay, humanBytes, humanDuration, metaLine } from '../format'

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
})
