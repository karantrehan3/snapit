import { describe, it, expect } from 'vitest'
import { cdpEndpoint, chromeCandidates, launchArgs } from '../chrome'

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
