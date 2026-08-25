import { describe, it, expect } from 'vitest'
import { looksLikeBrowser, webAppNudge } from '../browserHint'

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

describe('webAppNudge', () => {
  it('speaks up when the window names its browser', () => {
    expect(webAppNudge({ name: 'Checkout - Google Chrome', type: 'window' })).toMatch(/looks like a browser/)
  })

  it('says nothing when the title gives nothing away', () => {
    // On macOS a Chrome window is usually titled with the page, so this finds nothing
    // most of the time. That is fine now: the Web app option is permanently in the
    // selector, so a silent nudge hides nothing — it only declines to point.
    expect(webAppNudge({ name: 'Checkout', type: 'window' })).toBeNull()
  })

  it('says nothing for an ordinary screen capture', () => {
    expect(webAppNudge({ name: 'Entire screen', type: 'screen' })).toBeNull()
  })

  it('speaks up for a whole screen when a browser is named', () => {
    expect(webAppNudge({ name: 'Google Chrome', type: 'screen' })).not.toBeNull()
  })

  it('says nothing when nothing is selected yet', () => {
    expect(webAppNudge(null)).toBeNull()
  })

  it('explains what recording the picture would miss', () => {
    expect(webAppNudge({ name: 'Google Chrome', type: 'window' })).toMatch(/console, network, steps/)
  })
})
