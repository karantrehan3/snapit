import { describe, it, expect } from 'vitest'
import { buildMeta, type MetaInput } from '../bundle'
import { bundleMarkdown } from '../markdown'

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
  durationMs: 84_000,
  hasSystemAudio: false,
  source: null,
  markers: [],
  ...over
})

const session = buildMeta(base({ kind: 'browser-session' }))

describe('bundleMarkdown — browser session', () => {
  const md = bundleMarkdown({
    bundleName: 'snapit-2026-08-22_14-31-07',
    meta: session,
    steps: [
      { step: 1, at: '0:01', did: 'Fill Email with “ada@example.com”' },
      { step: 2, at: '0:07', did: 'Click button “Place order”' }
    ],
    failedRequests: [
      { method: 'POST', status: 500, url: 'https://api.test/orders', statusText: 'Internal Server Error' }
    ],
    console: [{ at: '0:08', level: 'error', text: 'Cannot read properties of null', count: 3 }]
  })

  it('leads with what it is and when', () => {
    expect(md).toContain('# Browser session — snapit-2026-08-22_14-31-07')
    expect(md).toContain('**Duration** 1:24')
    expect(md).toContain('**snapit** 3.2.0')
  })

  it('numbers the repro steps so they can be followed', () => {
    expect(md).toContain('1. (0:01) Fill Email')
    expect(md).toContain('2. (0:07) Click button')
  })

  it('shows the failure with its status and message', () => {
    expect(md).toContain('POST 500')
    expect(md).toContain('api.test/orders')
    expect(md).toContain('Internal Server Error')
  })

  it('carries the repeat count rather than one line of three', () => {
    expect(md).toContain('(x3)')
  })

  it('fences console output, which is arbitrary text from another application', () => {
    const fences = md.match(/```/g) ?? []
    expect(fences).toHaveLength(2)
  })

  it('omits sections it has nothing for, rather than leaving empty headings', () => {
    const bare = bundleMarkdown({ bundleName: 'b', meta: session })
    expect(bare).not.toContain('## Steps to reproduce')
    expect(bare).not.toContain('## Console')
    expect(bare).not.toContain('## Markers')
  })
})

describe('bundleMarkdown — hostile content', () => {
  it('cannot be broken out of an inline code span by a backtick', () => {
    const md = bundleMarkdown({
      bundleName: 'b',
      meta: session,
      failedRequests: [{ method: 'GET', status: 500, url: 'https://api.test/`?x=`y' }]
    })
    // An unbalanced backtick would end the span early and spill raw text into the doc.
    const inlineTicks = md.replace(/```[\s\S]*?```/g, '').match(/`/g) ?? []
    expect(inlineTicks.length % 2).toBe(0)
  })

  it('keeps a multi-line console message on one line', () => {
    const md = bundleMarkdown({
      bundleName: 'b',
      meta: session,
      console: [{ at: '0:01', level: 'error', text: 'boom\n  at thing (file.js:1)\n  at other', count: 1 }]
    })
    const body = md.split('```')[1]
    expect(body.trim().split('\n')).toHaveLength(1)
  })

  it('flattens a step label that somehow contains newlines', () => {
    const md = bundleMarkdown({
      bundleName: 'b',
      meta: session,
      steps: [{ step: 1, at: '0:01', did: 'Click button\n"Multi\nline"' }]
    })
    expect(md).toContain('1. (0:01) Click button "Multi line"')
  })
})

describe('bundleMarkdown — recording', () => {
  const md = bundleMarkdown({
    bundleName: 'snapit-rec',
    meta: buildMeta(
      base({
        mediaName: 'snapit-rec.mp4',
        mediaBytes: 1024,
        ext: 'mp4',
        markers: [{ atMs: 14_000, note: 'button misaligned' }],
        source: { id: 'window:1:0', name: 'Checkout — Chrome', type: 'window' }
      })
    ),
    console: []
  })

  it('titles it as a capture and names the source window', () => {
    expect(md).toContain('# Screen capture — snapit-rec')
    expect(md).toContain('**Source** Checkout — Chrome')
  })

  it('lists markers with their notes', () => {
    expect(md).toContain('- 0:14 — button misaligned')
  })

  it('points at the recording rather than at collector data it does not have', () => {
    expect(md).toContain('Recording and full data')
  })
})
