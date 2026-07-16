import { describe, it, expect } from 'vitest'
import {
  EDITABLE_EXTENSIONS,
  normalizeExt,
  isEditableImage,
  mimeForExt,
  mimeForPath,
  bufferFromDataUrl
} from '../imageFile'

describe('normalizeExt', () => {
  it('lowercases and strips the leading dot', () => {
    expect(normalizeExt('photo.PNG')).toBe('png')
    expect(normalizeExt('/a/b/IMG.JPeG')).toBe('jpeg')
    expect(normalizeExt('shot.webp')).toBe('webp')
  })

  it('returns empty string when there is no extension', () => {
    expect(normalizeExt('README')).toBe('')
    expect(normalizeExt('/tmp/noext')).toBe('')
  })
})

describe('isEditableImage', () => {
  it('accepts the supported still-image formats (case-insensitive)', () => {
    expect(isEditableImage('a.png')).toBe(true)
    expect(isEditableImage('a.JPG')).toBe(true)
    expect(isEditableImage('/x/y/a.jpeg')).toBe(true)
    expect(isEditableImage('a.webp')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isEditableImage('a.gif')).toBe(false)
    expect(isEditableImage('a.bmp')).toBe(false)
    expect(isEditableImage('a.mp4')).toBe(false)
    expect(isEditableImage('noext')).toBe(false)
    expect(isEditableImage('')).toBe(false)
  })

  it('covers exactly the advertised extension list', () => {
    for (const ext of EDITABLE_EXTENSIONS) {
      expect(isEditableImage(`file.${ext}`)).toBe(true)
    }
  })
})

describe('mimeForExt / mimeForPath', () => {
  it('maps extensions to MIME types', () => {
    expect(mimeForExt('png')).toBe('image/png')
    expect(mimeForExt('PNG')).toBe('image/png')
    expect(mimeForExt('jpg')).toBe('image/jpeg')
    expect(mimeForExt('jpeg')).toBe('image/jpeg')
    expect(mimeForExt('webp')).toBe('image/webp')
  })

  it('returns null for unknown extensions', () => {
    expect(mimeForExt('gif')).toBeNull()
    expect(mimeForExt('')).toBeNull()
  })

  it('derives the MIME from a path', () => {
    expect(mimeForPath('/x/y/photo.JPG')).toBe('image/jpeg')
    expect(mimeForPath('a.webp')).toBe('image/webp')
    expect(mimeForPath('a.gif')).toBeNull()
  })
})

describe('bufferFromDataUrl', () => {
  // 1x1 transparent PNG.
  const png1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  it('decodes a valid image data URL to the original bytes', () => {
    const buf = bufferFromDataUrl(png1x1)
    // PNG magic number.
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(buf.length).toBeGreaterThan(0)
  })

  it('accepts jpeg and webp image data URLs', () => {
    expect(() => bufferFromDataUrl('data:image/jpeg;base64,QUJD')).not.toThrow()
    expect(() => bufferFromDataUrl('data:image/webp;base64,QUJD')).not.toThrow()
  })

  it('rejects non-image or malformed data URLs', () => {
    expect(() => bufferFromDataUrl('data:text/plain;base64,QUJD')).toThrow()
    expect(() => bufferFromDataUrl('not-a-data-url')).toThrow()
    expect(() => bufferFromDataUrl('data:image/png,notbase64')).toThrow()
    expect(() => bufferFromDataUrl('')).toThrow()
  })
})
