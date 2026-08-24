import { describe, it, expect } from 'vitest'
import { LANDING_PAGE, cdpEndpoint, chromeCandidates, launchArgs } from '../chrome'

describe('chromeCandidates', () => {
  it('offers real Chromium locations per platform', () => {
    expect(chromeCandidates('darwin')[0]).toContain('Google Chrome')
    expect(chromeCandidates('linux').some((p) => p.includes('chromium'))).toBe(true)
  })

  it('builds Windows paths from the environment rather than hardcoding a drive', () => {
    const paths = chromeCandidates('win32', { PROGRAMFILES: 'D:\\Apps' })
    expect(paths).toContain('D:\\Apps\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('skips Windows roots the environment does not define', () => {
    expect(chromeCandidates('win32', {})).toEqual([])
  })

  it('never returns duplicates that would make resolution order ambiguous', () => {
    for (const p of ['darwin', 'linux'] as const) {
      const list = chromeCandidates(p)
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe('launchArgs', () => {
  const args = launchArgs({ port: 47333, profileDir: '/tmp/profile' })

  it('binds the debugging port to loopback explicitly', () => {
    // An open debugging port is total control of the browser. This must never be
    // relaxed to 0.0.0.0 for convenience.
    expect(args).toContain('--remote-debugging-address=127.0.0.1')
    expect(args).toContain('--remote-debugging-port=47333')
  })

  it('uses a dedicated profile, which Chrome requires for remote debugging', () => {
    expect(args).toContain('--user-data-dir=/tmp/profile')
  })

  it('never weakens the browser to make collection easier', () => {
    const forbidden = [
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--ignore-certificate-errors',
      '--disable-site-isolation-trials'
    ]
    for (const flag of forbidden) expect(args.some((a) => a.startsWith(flag))).toBe(false)
  })

  it('opens a start URL only when one is given', () => {
    expect(args).not.toContain('about:blank')
    expect(launchArgs({ port: 1, profileDir: '/p', startUrl: 'https://example.test' })).toContain(
      'https://example.test'
    )
  })
})

describe('cdpEndpoint', () => {
  it('addresses loopback by IP, not by a name that could resolve elsewhere', () => {
    expect(cdpEndpoint(47333)).toBe('http://127.0.0.1:47333')
  })
})

describe('LANDING_PAGE', () => {
  const decoded = decodeURIComponent(LANDING_PAGE.replace(/^data:text\/html,/, ''))

  it('is a self-contained data URL, so nothing is written to disk', () => {
    expect(LANDING_PAGE.startsWith('data:text/html,')).toBe(true)
    expect(decoded).not.toMatch(/<(script|link)\b/i)
    expect(decoded).not.toMatch(/https?:\/\//)
  })

  it('answers the question the browser cannot: which window is being collected', () => {
    // A fresh profile looks like any other Chrome, and reproducing a bug in the wrong
    // window produces an empty trail with nothing to explain it.
    expect(decoded).toContain("This is snapit's browser")
    expect(decoded).toContain('this window')
  })

  it('tells the user that setup is discarded, which is why it is safe to sign in', () => {
    expect(decoded).toContain('Start capture')
    expect(decoded).toContain('thrown away')
    expect(decoded).toContain('Stop and save')
  })

  it('is opened by the launcher as the start URL', () => {
    expect(launchArgs({ port: 1, profileDir: '/p', startUrl: LANDING_PAGE })).toContain(LANDING_PAGE)
  })
})
