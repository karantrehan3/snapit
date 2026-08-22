import { describe, it, expect } from 'vitest'
import {
  clock,
  stepDetail,
  summariseConsole,
  summariseFailedRequests,
  summariseSteps,
  type ConsoleInput
} from '../summarise'
import type { ActionRecord } from '../../collector/actions'

describe('clock', () => {
  it('reads the way a human would', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(7_400)).toBe('0:07')
    expect(clock(727_000)).toBe('12:07')
  })

  it('never renders a negative time', () => {
    expect(clock(-5)).toBe('0:00')
  })
})

describe('summariseConsole', () => {
  const entries: ConsoleInput[] = [
    { atMs: 100, level: 'log', text: 'mounted' },
    { atMs: 200, level: 'warning', text: 'deprecated prop' },
    { atMs: 300, level: 'error', text: 'Cannot read properties of null' },
    { atMs: 400, level: 'error', text: 'Cannot read properties of null' },
    { atMs: 500, level: 'error', text: 'Cannot read properties of null' },
    { atMs: 600, level: 'info', text: 'analytics ready' },
    { atMs: 700, level: 'uncaught', text: 'TypeError: x is not a function' }
  ]

  const out = summariseConsole(entries)

  it('drops the chatter that is almost never why the capture exists', () => {
    expect(out.some((l) => l.text === 'mounted')).toBe(false)
    expect(out.some((l) => l.text === 'analytics ready')).toBe(false)
  })

  it('collapses a repeated failure into one line with a count', () => {
    // Four hundred identical log lines are one problem, not four hundred.
    const repeated = out.find((l) => l.text.startsWith('Cannot read'))
    expect(repeated?.count).toBe(3)
    expect(out.filter((l) => l.text.startsWith('Cannot read'))).toHaveLength(1)
  })

  it('keeps the time of the first occurrence, not the last', () => {
    expect(out.find((l) => l.text.startsWith('Cannot read'))?.at).toBe('0:00')
  })

  it('puts errors above warnings', () => {
    const levels = out.map((l) => l.level)
    expect(levels.indexOf('warning')).toBeGreaterThan(levels.indexOf('error'))
  })

  it('can be asked for everything when that is genuinely wanted', () => {
    expect(summariseConsole(entries, { includeAll: true }).length).toBeGreaterThan(out.length)
  })

  it('respects the limit, because this lands in a context window', () => {
    const many: ConsoleInput[] = Array.from({ length: 200 }, (_, i) => ({
      atMs: i,
      level: 'error',
      text: `distinct failure ${i}`
    }))
    expect(summariseConsole(many, { limit: 5 })).toHaveLength(5)
  })

  it('clips a single enormous message rather than letting it dominate', () => {
    const [line] = summariseConsole([{ atMs: 0, level: 'error', text: 'x'.repeat(5000) }])
    expect(line.text.length).toBeLessThan(400)
    expect(line.text.endsWith('...')).toBe(true)
  })
})

describe('summariseFailedRequests', () => {
  const har = {
    log: {
      entries: [
        { request: { method: 'GET', url: 'https://api.test/ok' }, response: { status: 200 } },
        { request: { method: 'GET', url: 'https://api.test/missing' }, response: { status: 404 } },
        {
          request: { method: 'POST', url: 'https://api.test/orders' },
          response: { status: 500, statusText: 'Internal Server Error' }
        },
        { request: { method: 'GET', url: 'https://api.test/dead' }, response: { status: 0 } }
      ]
    }
  }

  it('keeps only what failed', () => {
    const out = summariseFailedRequests(har)
    expect(out).toHaveLength(3)
    expect(out.some((r) => r.url.endsWith('/ok'))).toBe(false)
  })

  it('counts a connection failure as a failure, not a success', () => {
    expect(summariseFailedRequests(har).some((r) => r.status === 0)).toBe(true)
  })

  it('carries the status text when the server bothered to send one', () => {
    expect(summariseFailedRequests(har).find((r) => r.status === 500)?.statusText).toBe(
      'Internal Server Error'
    )
  })

  it('survives a HAR that is missing or malformed', () => {
    expect(summariseFailedRequests(undefined)).toEqual([])
    expect(summariseFailedRequests({ log: {} })).toEqual([])
    expect(summariseFailedRequests('not a har')).toEqual([])
  })
})

describe('summariseSteps and stepDetail', () => {
  const actions: ActionRecord[] = [
    {
      atMs: 1_000,
      type: 'fill',
      tag: 'input',
      value: 'ada@example.com',
      selectors: [{ kind: 'label', value: 'Email' }],
      ariaAfter: '- textbox "Email": [redacted by snapit]'
    },
    {
      atMs: 7_400,
      type: 'click',
      tag: 'button',
      selectors: [
        { kind: 'testid', value: 'place-order' },
        { kind: 'role', role: 'button', name: 'Place order' }
      ],
      ariaAfter: '- status: Order placed'
    }
  ]

  it('lists one readable line per step and nothing more', () => {
    const out = summariseSteps(actions)
    expect(out).toEqual([
      { step: 1, at: '0:01', did: 'Fill Email with “ada@example.com”' },
      { step: 2, at: '0:07', did: 'Click button “Place order”' }
    ])
  })

  it('carries no selectors or snapshots in the list, which is the whole point', () => {
    const serialized = JSON.stringify(summariseSteps(actions))
    expect(serialized).not.toContain('place-order')
    expect(serialized).not.toContain('Order placed')
  })

  it('returns the selectors and the snapshot only when a step is asked for', () => {
    const detail = stepDetail(actions, 2)
    expect(detail?.selectors).toHaveLength(2)
    expect(detail?.ariaAfter).toBe('- status: Order placed')
  })

  it('numbers steps from one, the way the list presents them', () => {
    expect(stepDetail(actions, 1)?.type).toBe('fill')
  })

  it('returns null for a step that does not exist rather than throwing', () => {
    expect(stepDetail(actions, 0)).toBeNull()
    expect(stepDetail(actions, 99)).toBeNull()
    expect(stepDetail([], 1)).toBeNull()
  })
})

describe('summariseFailedRequests — response bodies', () => {
  const har = {
    log: {
      entries: [
        {
          request: { method: 'POST', url: 'https://api.test/orders' },
          response: { status: 500, content: { text: '{\n  "error": "kaboom",\n  "trace": "..."\n}' } }
        },
        { request: { method: 'GET', url: 'https://api.test/gone' }, response: { status: 404 } }
      ]
    }
  }

  it('carries the body, which is usually the actual reason', () => {
    const [failed] = summariseFailedRequests(har)
    expect(failed.body).toContain('kaboom')
  })

  it('flattens it to one line, since a body arrives with whatever formatting it had', () => {
    expect(summariseFailedRequests(har)[0].body).not.toContain('\n')
  })

  it('omits the field entirely when no body was captured', () => {
    expect(summariseFailedRequests(har)[1]).not.toHaveProperty('body')
  })

  it('previews rather than repeats the whole body — the HAR holds that', () => {
    const huge = {
      log: {
        entries: [
          {
            request: { method: 'GET', url: 'u' },
            response: { status: 500, content: { text: 'x'.repeat(9000) } }
          }
        ]
      }
    }
    expect(summariseFailedRequests(huge)[0].body!.length).toBeLessThan(700)
  })
})
