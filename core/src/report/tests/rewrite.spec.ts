import { describe, expect, test } from 'vitest'
import { rewriteMediaSrc, withBase } from '../rewrite.ts'

/**
 * The markup below is what `src/main/report.ts` emits verbatim — a video element with
 * `controls preload="metadata"`, and an image with an `alt`. If the app changes either,
 * these fail, which is the point: the alternative is discovering it from a share link
 * that plays nothing.
 */
const VIDEO = '<video controls preload="metadata" src="snapit-2026-09-19.mp4"></video>'
const IMAGE = '<img src="snapit-2026-09-19.png" alt="Screen capture" />'
const SIGNED = 'https://b.s3.eu-west-1.amazonaws.com/k.mp4?X-Amz-Date=20260919T000000Z&X-Amz-Signature=abc'

describe('rewriting the media source', () => {
  test('points the video at the signed URL', () => {
    const { html, rewritten } = rewriteMediaSrc(VIDEO, 'snapit-2026-09-19.mp4', SIGNED)
    expect(rewritten).toBe(true)
    expect(html).toContain(
      'src="https://b.s3.eu-west-1.amazonaws.com/k.mp4?X-Amz-Date=20260919T000000Z&amp;X-Amz-Signature=abc"'
    )
    expect(html).not.toContain('src="snapit-2026-09-19.mp4"')
  })

  test('escapes the ampersands between query parameters', () => {
    // Unescaped, `&X-Amz-Signature` risks being parsed as an entity reference, and the
    // signature that arrives at S3 is then not the one that was signed.
    const { html } = rewriteMediaSrc(VIDEO, 'snapit-2026-09-19.mp4', SIGNED)
    const src = /src="([^"]*)"/.exec(html)![1]!
    expect(src).toContain('&amp;X-Amz-Signature=abc')
    // No bare ampersand survives anywhere in the attribute.
    expect(src.replace(/&amp;/g, '')).not.toContain('&')
  })

  test('works for a still, which is an img rather than a video', () => {
    const { html, rewritten } = rewriteMediaSrc(IMAGE, 'snapit-2026-09-19.png', SIGNED)
    expect(rewritten).toBe(true)
    expect(html).toContain('alt="Screen capture"')
  })

  test('leaves the same filename alone where it is prose, not a source', () => {
    const page =
      `<p>Recording and full data in <code>snapit-2026-09-19.mp4</code>.</p>${VIDEO}` +
      `<a href="snapit-2026-09-19.mp4">download</a>`
    const { html } = rewriteMediaSrc(page, 'snapit-2026-09-19.mp4', SIGNED)
    expect(html).toContain('<code>snapit-2026-09-19.mp4</code>')
    expect(html).toContain('<a href="snapit-2026-09-19.mp4">')
    expect(html).toContain(`src="${SIGNED.replace(/&/g, '&amp;')}"`)
  })

  test('reports a miss instead of serving a player that cannot load', () => {
    expect(rewriteMediaSrc(VIDEO, 'a-different-name.mp4', SIGNED)).toEqual({ html: VIDEO, rewritten: false })
    expect(rewriteMediaSrc('<p>no media at all</p>', 'x.mp4', SIGNED).rewritten).toBe(false)
  })

  test('handles a filename containing characters the report escapes', () => {
    // The report writes the name through escapeHtml, so the needle must be escaped too.
    const html = '<video controls src="a&amp;b.mp4"></video>'
    expect(rewriteMediaSrc(html, 'a&b.mp4', SIGNED).rewritten).toBe(true)
  })
})

describe('withBase', () => {
  test('inserts the base immediately after head, where it means something', () => {
    expect(withBase('<html><head><meta charset="utf-8"></head>', 'https://x/y/')).toBe(
      '<html><head><base href="https://x/y/"><meta charset="utf-8"></head>'
    )
  })

  test('survives a head with attributes', () => {
    expect(withBase('<head lang="en">', 'https://x/')).toContain('<head lang="en"><base href="https://x/">')
  })

  test('leaves a document with no head untouched rather than corrupting it', () => {
    expect(withBase('<p>fragment</p>', 'https://x/')).toBe('<p>fragment</p>')
  })
})
