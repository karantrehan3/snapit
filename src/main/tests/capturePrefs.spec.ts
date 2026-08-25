import { describe, it, expect } from 'vitest'
import { coerceCapture, defaultCapture } from '../capturePrefs'

describe('coerceCapture', () => {
  it('falls back to defaults for anything that is not an object', () => {
    for (const junk of [null, undefined, 'high', 42, []]) {
      expect(coerceCapture(junk)).toEqual(defaultCapture())
    }
  })

  it('keeps only the fields it recognises', () => {
    const prefs = coerceCapture({ fps: 30, evil: 'rm -rf', __proto__: { x: 1 } })
    expect(prefs.fps).toBe(30)
    expect(Object.keys(prefs).sort()).toEqual(Object.keys(defaultCapture()).sort())
  })

  it('leaves the rest at their defaults when only one field is set', () => {
    const prefs = coerceCapture({ mic: false })
    expect(prefs.mic).toBe(false)
    expect(prefs.fps).toBe(defaultCapture().fps)
    expect(prefs.quality).toBe(defaultCapture().quality)
  })

  it('clamps a frame rate into the range the control offers', () => {
    // Clamping is what the fps control itself does, so a value just outside the range
    // is a rounding difference rather than a choice nobody made.
    expect(coerceCapture({ fps: 9000 }).fps).toBe(60)
    expect(coerceCapture({ fps: 1 }).fps).toBe(5)
    expect(coerceCapture({ fps: 29.6 }).fps).toBe(30)
  })

  it('refuses a frame rate that is not a number', () => {
    expect(coerceCapture({ fps: '60' }).fps).toBe(defaultCapture().fps)
    expect(coerceCapture({ fps: NaN }).fps).toBe(defaultCapture().fps)
  })

  it('keeps the two frame rates apart', () => {
    // A 60fps GIF is enormous and a 60fps recording is not; one shared number would
    // have quietly changed one of them.
    const prefs = coerceCapture({ fps: 60, silentFps: 15 })
    expect(prefs.fps).toBe(60)
    expect(prefs.silentFps).toBe(15)
    expect(defaultCapture().silentFps).not.toBe(defaultCapture().fps)
  })

  it('treats a null retro window as the choice it is', () => {
    // null means "keep everything" — a real selection, not a missing value.
    expect(coerceCapture({ retroSec: null }).retroSec).toBeNull()
  })

  it('rejects a retro window that could not have come from the control', () => {
    for (const bad of [0, -30, 99_999, 'thirty', NaN]) {
      expect(coerceCapture({ retroSec: bad }).retroSec).toBe(defaultCapture().retroSec)
    }
    expect(coerceCapture({ retroSec: 180 }).retroSec).toBe(180)
  })

  it('accepts only the presets that exist', () => {
    expect(coerceCapture({ quality: 'small' }).quality).toBe('small')
    expect(coerceCapture({ quality: 'lossless' }).quality).toBe(defaultCapture().quality)
    expect(coerceCapture({ silentFormat: 'gif' }).silentFormat).toBe('gif')
    expect(coerceCapture({ silentFormat: 'webm' }).silentFormat).toBe(defaultCapture().silentFormat)
  })

  it('round-trips its own defaults', () => {
    // What gets written to settings.json has to survive being read back.
    expect(coerceCapture(defaultCapture())).toEqual(defaultCapture())
  })
})
