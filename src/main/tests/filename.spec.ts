import { describe, it, expect, vi, afterEach } from 'vitest'
import { timestamp, captureFilePath } from '../filename'

afterEach(() => {
  vi.useRealTimers()
})

describe('timestamp', () => {
  it('formats as YYYY-MM-DD_HH-MM-SS, zero-padded', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 9, 3, 7)) // Jan 5 2026, 09:03:07 local time
    expect(timestamp()).toBe('2026-01-05_09-03-07')
  })

  it('pads single-digit month/day/hour/minute/second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 1))
    expect(timestamp()).toBe('2026-11-20_23-59-01')
  })
})

describe('captureFilePath', () => {
  it('joins the save dir with a snapit-<timestamp>.<ext> filename', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0))
    expect(captureFilePath('/tmp/snapit', 'png')).toBe('/tmp/snapit/snapit-2026-01-01_00-00-00.png')
  })

  it('uses the given extension as-is', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0))
    expect(captureFilePath('/tmp/snapit', 'jpg')).toMatch(/\.jpg$/)
  })
})
