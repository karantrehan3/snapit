import { describe, expect, it } from 'vitest'
import { MAX_NAME, checkCaptureName, nameWithoutExtension } from '../captureName'

const bundle = 'snapit-2026-08-31_12-48-17'
const loose = 'snapit-2026-08-06_22-44-30.png'

const why = (input: string, current = bundle, existing: string[] = []): string => {
  const r = checkCaptureName(input, current, existing)
  return r.ok ? '' : r.why
}
const named = (input: string, current = bundle, existing: string[] = []): string => {
  const r = checkCaptureName(input, current, existing)
  return r.ok ? r.name : `REFUSED: ${r.why}`
}

describe('checkCaptureName', () => {
  it('accepts an ordinary name and trims it', () => {
    expect(named('  Login 500 on staging  ')).toBe('Login 500 on staging')
  })

  it('refuses a name that would escape the save folder', () => {
    // Refused rather than sanitised: rewriting this would rename something else and
    // report success.
    expect(why('../evidence')).toContain('cannot contain')
    expect(why('a/b')).toContain('cannot contain')
    expect(why('a\\b')).toContain('cannot contain')
  })

  it('refuses a name that would hide the capture', () => {
    expect(why('.hidden')).toContain('hide')
    expect(why('.')).toContain('hide')
  })

  it('refuses a colon and control characters, which Finder and Windows both reject', () => {
    expect(why('12:48 failure')).toContain('cannot contain')
    expect(why(`line${String.fromCharCode(10)}break`)).toContain('cannot contain')
    expect(why(`nul${String.fromCharCode(0)}`)).toContain('cannot contain')
  })

  it('refuses a trailing dot, which a filesystem would quietly drop', () => {
    expect(why('Login bug.')).toContain('cannot end')
    // A trailing space is only trimmed, which is harmless and expected.
    expect(named('Login bug ')).toBe('Login bug')
  })

  it('refuses nothing, and refuses too much', () => {
    expect(why('')).toContain('needs a name')
    expect(why('   ')).toContain('needs a name')
    expect(why('x'.repeat(MAX_NAME + 1))).toContain(String(MAX_NAME))
    expect(why('x'.repeat(MAX_NAME))).toBe('')
  })

  it('keeps a loose capture its extension, whether or not it was typed', () => {
    // The library reads the kind off the extension: a .png renamed to .txt stops being
    // a screenshot.
    expect(named('Checkout blank', loose)).toBe('Checkout blank.png')
    expect(named('Checkout blank.png', loose)).toBe('Checkout blank.png')
    expect(named('Checkout blank.PNG', loose)).toBe('Checkout blank.PNG')
    // A bundle is a folder and gets no extension invented for it.
    expect(named('Checkout blank', bundle)).toBe('Checkout blank')
  })

  it('refuses a name another capture already has, case-insensitively', () => {
    // macOS treats these as one file, and a rename that "worked" and lost a capture is
    // the worst outcome available here.
    expect(why('Login bug', bundle, ['login BUG'])).toContain('already called that')
    expect(why('Login bug', bundle, ['something else'])).toBe('')
  })

  it('allows renaming a capture to a different case of its own name', () => {
    expect(named(bundle, bundle, [bundle])).toBe(bundle)
    expect(named('SNAPIT-2026-08-31_12-48-17', bundle, [bundle])).toBe('SNAPIT-2026-08-31_12-48-17')
  })

  it('offers the name without its extension to type over', () => {
    expect(nameWithoutExtension(loose)).toBe('snapit-2026-08-06_22-44-30')
    expect(nameWithoutExtension(bundle)).toBe(bundle)
    expect(nameWithoutExtension('.gitignore')).toBe('.gitignore')
  })
})
