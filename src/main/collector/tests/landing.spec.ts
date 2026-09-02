import { describe, it, expect } from 'vitest'
import { LANDING_FILE, LANDING_TITLE, renderLanding } from '../landing'

/**
 * The page is the first thing anyone sees of a web capture, and it has two jobs that are
 * easy to break silently: say which window is being recorded, and carry the title the
 * window matcher looks for. The rest of these guard what it must *not* do — reach the
 * network from inside a browser whose every request is being recorded.
 */

describe('renderLanding', () => {
  const html = renderLanding()

  it('carries the title the window matcher and the Chrome profile both use', () => {
    // captureSession.ts finds the window to record by matching this string; a title that
    // drifts from it means a capture with no video and nothing to explain why.
    expect(html).toContain(`<title>${LANDING_TITLE}</title>`)
  })

  it('answers the question the browser cannot: which window is being collected', () => {
    expect(html).toContain("This is snapit's browser")
    expect(html).toContain('this window')
  })

  it('tells the user that setup is discarded, which is why it is safe to sign in', () => {
    expect(html).toContain('Start capture')
    expect(html).toContain('thrown away')
    expect(html).toContain('Stop and save')
  })

  it('points at the session bar rather than the menu bar it used to live in', () => {
    expect(html).toContain('snapit bar at the top of your screen')
    expect(html).not.toContain('menu bar icon')
  })

  it('fetches nothing, so the first HAR entries are the app under test', () => {
    expect(html).not.toMatch(/<(script|link|img|iframe)\b/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('is written as a plain .html file, so the address bar shows a path', () => {
    expect(LANDING_FILE).toMatch(/^[\w-]+\.html$/)
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })
})
