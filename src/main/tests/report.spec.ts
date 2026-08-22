import { describe, it, expect } from 'vitest'
import { buildMeta, type MetaInput } from '../bundle'
import { escapeHtml, renderReport } from '../report'

const base = (over: Partial<MetaInput> = {}): MetaInput => ({
  capturedAt: new Date('2026-08-22T12:31:07.000Z'),
  appVersion: '3.2.0',
  platform: 'darwin',
  release: '25.5.0',
  arch: 'arm64',
  locale: 'en-GB',
  timeZone: 'Europe/London',
  displays: [
    {
      id: 1,
      label: 'Built-in Retina Display',
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
      scaleFactor: 2,
      isPrimary: true
    }
  ],
  durationMs: 64_000,
  hasSystemAudio: false,
  source: { id: 'window:42:0', name: 'Checkout — Chrome', type: 'window' },
  mediaName: 'snapit-2026-08-22_14-31-07.mp4',
  mediaBytes: 1_572_864,
  ext: 'mp4',
  ...over
})

describe('renderReport', () => {
  it('embeds the media by relative name, so the folder is portable', () => {
    const html = renderReport(buildMeta(base()))
    expect(html).toContain('src="snapit-2026-08-22_14-31-07.mp4"')
  })

  it('fetches nothing from the network', () => {
    // The whole point of the bundle: it has to open on a machine with no network
    // and no trust. Any external reference breaks that, silently.
    const html = renderReport(buildMeta(base()))
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/(src|href)\s*=\s*"\/\//)
    expect(html).not.toContain('<script')
  })

  it('plays video but shows a gif as an image', () => {
    expect(renderReport(buildMeta(base()))).toContain('<video')
    const gif = renderReport(buildMeta(base({ ext: 'gif', mediaName: 'snapit.gif' })))
    expect(gif).toContain('<img')
    expect(gif).not.toContain('<video')
  })

  it('escapes window titles, which are arbitrary text from other applications', () => {
    const html = renderReport(
      buildMeta(base({ source: { id: 'window:1:0', name: '<img src=x onerror=alert(1)>', type: 'window' } }))
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes a quote in the media filename rather than breaking out of the attribute', () => {
    const html = renderReport(buildMeta(base({ mediaName: 'a" onerror="alert(1).mp4' })))
    expect(html).not.toContain('onerror="alert(1)')
  })

  it('reports the display configuration', () => {
    const html = renderReport(buildMeta(base()))
    expect(html).toContain('1512×982 @ 2x')
    expect(html).toContain('Built-in Retina Display (primary)')
  })
})

describe('escapeHtml', () => {
  it('covers every character that can escape a quoted attribute', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
