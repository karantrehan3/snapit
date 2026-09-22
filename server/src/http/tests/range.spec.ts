import { describe, expect, test } from 'vitest'
import { contentRange, isClientDisconnect, parseByteRange, rangeLength } from '../range.ts'

const SIZE = 1000

describe('parsing a Range header', () => {
  test('honours the open-ended range Chrome sends first for a video', () => {
    expect(parseByteRange('bytes=0-', SIZE)).toEqual({ kind: 'partial', range: { start: 0, end: 999 } })
  })

  test('honours an explicit window', () => {
    expect(parseByteRange('bytes=200-499', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 200, end: 499 }
    })
  })

  test('reads a suffix range as the LAST n bytes, not the first', () => {
    // `bytes=-500` asking for the end of a file is what a player does to find an MP4's
    // moov atom. Getting this backwards serves the beginning and the video never starts.
    expect(parseByteRange('bytes=-500', SIZE)).toEqual({ kind: 'partial', range: { start: 500, end: 999 } })
  })

  test('a suffix longer than the object is the whole object', () => {
    expect(parseByteRange('bytes=-5000', SIZE)).toEqual({ kind: 'partial', range: { start: 0, end: 999 } })
  })

  test('clamps an end past the last byte rather than reading off the end', () => {
    expect(parseByteRange('bytes=900-99999', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 900, end: 999 }
    })
  })

  test('a start at or past the end is unsatisfiable, which is a 416 and not a 200', () => {
    expect(parseByteRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=5000-6000', SIZE)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=500-499', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  test.each([
    ['no header', undefined],
    ['empty', ''],
    ['another unit', 'items=0-10'],
    ['several ranges — declining by sending everything is allowed', 'bytes=0-99,200-299'],
    ['nonsense', 'bytes=abc-def'],
    ['both ends open', 'bytes=-']
  ])('falls back to the whole object: %s', (_label, header) => {
    expect(parseByteRange(header, SIZE)).toEqual({ kind: 'full' })
  })

  test('an empty object has nothing to range over', () => {
    expect(parseByteRange('bytes=0-', 0)).toEqual({ kind: 'full' })
  })

  test('takes the first value when a header arrives twice', () => {
    expect(parseByteRange(['bytes=0-9', 'bytes=50-59'], SIZE)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 9 }
    })
  })
})

describe('response fields', () => {
  test('length is inclusive of both ends', () => {
    expect(rangeLength({ start: 0, end: 0 })).toBe(1)
    expect(rangeLength({ start: 200, end: 499 })).toBe(300)
  })

  test('Content-Range names the total size', () => {
    expect(contentRange({ start: 200, end: 499 }, SIZE)).toBe('bytes 200-499/1000')
  })
})

describe('isClientDisconnect', () => {
  test.each(['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE', 'ERR_STREAM_DESTROYED'])(
    'recognises %s as a hang-up rather than a fault',
    (code) => {
      expect(isClientDisconnect(Object.assign(new Error('x'), { code }))).toBe(true)
    }
  )

  test.each([
    ['a real failure', Object.assign(new Error('x'), { code: 'ENOENT' })],
    ['no code', new Error('x')],
    ['not an error', 'ECONNRESET'],
    ['null', null]
  ])('does not swallow %s', (_label, err) => {
    expect(isClientDisconnect(err)).toBe(false)
  })
})
