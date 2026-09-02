import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SCHEME,
  MEDIA_CSP,
  REPORT_CSP,
  REPORT_FILE,
  captureFileName,
  captureUrl,
  isGrantId,
  mediaTypeFor,
  parseCaptureUrl
} from '../captureUrl'

const ID = 'a'.repeat(32)

describe('isGrantId', () => {
  it('accepts 32 lowercase hex characters', () => {
    expect(isGrantId(ID)).toBe(true)
    expect(isGrantId('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('rejects anything that is not exactly that', () => {
    for (const bad of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), `${'a'.repeat(31)}g`]) {
      expect(isGrantId(bad), bad).toBe(false)
    }
  })
})

describe('captureFileName', () => {
  it('accepts the report and the media formats a bundle can hold', () => {
    expect(captureFileName('/report.html')).toBe('report.html')
    for (const name of ['capture.mp4', 'capture.webm', 'capture.gif', 'capture.png']) {
      expect(captureFileName(`/${name}`), name).toBe(name)
    }
  })

  it('decodes an escaped name', () => {
    expect(captureFileName('/my%20capture.mp4')).toBe('my capture.mp4')
  })

  it('refuses traversal rather than sanitising it', () => {
    for (const bad of [
      '/../meta.json',
      '/../../settings.json',
      '/..%2Fmeta.json',
      '/sub/capture.mp4',
      '/sub%2Fcapture.mp4',
      '/..\\capture.mp4'
    ]) {
      expect(captureFileName(bad), bad).toBeNull()
    }
  })

  it('refuses the bundle files the frame has no business reading', () => {
    // The report is rendered from these; handing them to the frame as well would put a
    // session's HAR — cookies stripped, but its URLs and bodies intact — one fetch away.
    for (const bad of ['/meta.json', '/network.har', '/console.json', '/actions.json']) {
      expect(captureFileName(bad), bad).toBeNull()
    }
  })

  it('refuses anything that is not a plain visible filename', () => {
    for (const bad of ['', 'report.html', '/', '/.hidden.png', '/a\0.png', `/${'a'.repeat(300)}.png`]) {
      expect(captureFileName(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('is case-insensitive about the extension only', () => {
    expect(captureFileName('/CAPTURE.MP4')).toBe('CAPTURE.MP4')
    expect(captureFileName('/REPORT.HTML')).toBeNull()
  })
})

describe('parseCaptureUrl', () => {
  it('splits a well-formed URL into its grant and its file', () => {
    expect(parseCaptureUrl(`${CAPTURE_SCHEME}://${ID}/report.html`)).toEqual({
      id: ID,
      file: 'report.html'
    })
  })

  it('round-trips what captureUrl builds', () => {
    expect(parseCaptureUrl(captureUrl(ID, 'my capture.mp4'))).toEqual({ id: ID, file: 'my capture.mp4' })
  })

  it('refuses another scheme, however it is spelled', () => {
    for (const bad of [
      `file:///${ID}/report.html`,
      `http://${ID}/report.html`,
      `snapit-captures://${ID}/report.html`,
      'not a url'
    ]) {
      expect(parseCaptureUrl(bad), bad).toBeNull()
    }
  })

  it('refuses a host that is not a grant id', () => {
    expect(parseCaptureUrl(`${CAPTURE_SCHEME}://elsewhere/report.html`)).toBeNull()
    expect(parseCaptureUrl(`${CAPTURE_SCHEME}:///report.html`)).toBeNull()
  })

  it('ignores a query and a fragment, which the report uses for its tabs', () => {
    expect(parseCaptureUrl(`${CAPTURE_SCHEME}://${ID}/report.html#requests`)).toEqual({
      id: ID,
      file: REPORT_FILE
    })
  })
})

describe('mediaTypeFor', () => {
  it('names the type, so a wrong guess cannot stop a video playing', () => {
    expect(mediaTypeFor('capture.mp4')).toBe('video/mp4')
    expect(mediaTypeFor('capture.WEBM')).toBe('video/webm')
    expect(mediaTypeFor('capture.png')).toBe('image/png')
  })

  it('returns null rather than a fallback for anything else', () => {
    expect(mediaTypeFor('report.html')).toBeNull()
    expect(mediaTypeFor('capture')).toBeNull()
  })
})

describe('the policies each response carries', () => {
  it('starts the report from nothing and names the scheme, not self', () => {
    // The frame is sandboxed without allow-same-origin, so its origin is opaque and
    // 'self' would match nothing at all — including the recording it has to play.
    expect(REPORT_CSP).toContain("default-src 'none'")
    expect(REPORT_CSP).toContain(`media-src ${CAPTURE_SCHEME}:`)
    expect(REPORT_CSP).not.toContain("'self'")
  })

  it('gives the report no way to reach the network', () => {
    // What an escaping bug would be worth: with no connect-src under default-src
    // 'none', an injected script has nowhere to send what it found.
    expect(REPORT_CSP).not.toContain('connect-src')
    expect(REPORT_CSP).not.toContain('*')
  })

  it('allows inline script only, and only because that script is ours', () => {
    expect(REPORT_CSP).toContain("script-src 'unsafe-inline'")
    expect(REPORT_CSP).not.toContain('script-src-elem')
  })

  it('allows media nothing at all', () => {
    expect(MEDIA_CSP).toBe("default-src 'none'")
  })
})
