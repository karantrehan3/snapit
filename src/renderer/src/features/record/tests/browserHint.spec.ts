import { describe, it, expect } from 'vitest'
import { browserHint, looksLikeBrowser } from '../browserHint'

describe('looksLikeBrowser', () => {
  it('recognises the browsers people actually use', () => {
    for (const name of ['Checkout - Google Chrome', 'Mozilla Firefox', 'Safari', 'Microsoft Edge', 'Brave']) {
      expect(looksLikeBrowser(name)).toBe(true)
    }
  })

  it('matches regardless of case', () => {
    expect(looksLikeBrowser('SOME PAGE — GOOGLE CHROME')).toBe(true)
  })

  it('does not claim every window is a browser', () => {
    for (const name of ['Terminal', 'Figma — Untitled', 'Slack | general', 'Xcode']) {
      expect(looksLikeBrowser(name)).toBe(false)
    }
  })
})

describe('browserHint', () => {
  it('is confident when the window names its browser', () => {
    const hint = browserHint({ name: 'Checkout - Google Chrome', type: 'window' })
    expect(hint?.confident).toBe(true)
    expect(hint?.text).toContain('looks like a browser')
  })

  it('still offers for a window whose title gives nothing away', () => {
    // On macOS a Chrome window is usually titled with the page, not the browser, so
    // detection failing must never hide the offer — that is the whole point of it.
    const hint = browserHint({ name: 'Checkout', type: 'window' })
    expect(hint).not.toBeNull()
    expect(hint?.confident).toBe(false)
  })

  it('says nothing for a plain screen capture, which is rarely about a web app', () => {
    expect(browserHint({ name: 'Entire screen', type: 'screen' })).toBeNull()
  })

  it('is confident even for a whole screen when a browser is named', () => {
    expect(browserHint({ name: 'Google Chrome', type: 'screen' })?.confident).toBe(true)
  })

  it('says nothing when nothing is selected yet', () => {
    expect(browserHint(null)).toBeNull()
  })

  it('always explains the limitation, however it is worded', () => {
    for (const source of [
      { name: 'Google Chrome', type: 'window' as const },
      { name: 'Untitled', type: 'window' as const }
    ]) {
      expect(browserHint(source)?.text).toMatch(/browser it opens/)
    }
  })
})
