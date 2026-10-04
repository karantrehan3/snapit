import { describe, expect, test } from 'vitest'
import { collectRelayed, hasErrors, type RelayedEvent } from '../relayed'

/**
 * These are the real CDP payload shapes, trimmed. The whole bet of the extension pivot is
 * that `chrome.debugger` delivers the same protocol the launched-Chrome collector read —
 * so if these shapes are wrong, the pivot does not work, and a test against invented
 * payloads would not notice.
 */
const at = (method: string, params: unknown, atMs = 0): RelayedEvent => ({ method, params, atMs })

describe('console', () => {
  test('reads console.log arguments, which arrive as remote objects not a string', () => {
    const { console: lines } = collectRelayed([
      at(
        'Runtime.consoleAPICalled',
        {
          type: 'log',
          args: [
            { type: 'string', value: 'total is' },
            { type: 'number', value: 42 }
          ]
        },
        1200
      )
    ])
    expect(lines).toEqual([{ atMs: 1200, level: 'log', text: 'total is 42' }])
  })

  test('prefers an object’s description, which is where a stack lives', () => {
    const { console: lines } = collectRelayed([
      at('Runtime.consoleAPICalled', {
        type: 'error',
        args: [
          { type: 'object', subtype: 'error', description: 'TypeError: x is not a function\n    at a.js:1' }
        ]
      })
    ])
    expect(lines[0]!.text).toContain('TypeError: x is not a function')
    expect(lines[0]!.level).toBe('error')
  })

  test('an argument it cannot render still shows that something was logged', () => {
    const { console: lines } = collectRelayed([
      at('Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'function' }] })
    ])
    expect(lines[0]!.text).toBe('function')
  })

  test('takes the call site from the stack, not the script the logger lives in', () => {
    const { console: lines } = collectRelayed([
      at('Runtime.consoleAPICalled', {
        type: 'warning',
        args: [{ value: 'slow' }],
        stackTrace: { callFrames: [{ url: 'https://app.test/checkout.js', lineNumber: 41 }] }
      })
    ])
    // CDP line numbers are zero-based; a reader expects the editor's numbering.
    expect(lines[0]).toMatchObject({ url: 'https://app.test/checkout.js', line: 42 })
  })

  test('reads Log.entryAdded, which uses its own vocabulary for the same thing', () => {
    const { console: lines } = collectRelayed([
      at(
        'Log.entryAdded',
        {
          entry: {
            level: 'error',
            text: 'Failed to load resource: 500',
            url: 'https://app.test/api/checkout',
            lineNumber: 0
          }
        },
        900
      )
    ])
    expect(lines).toEqual([
      {
        atMs: 900,
        level: 'error',
        text: 'Failed to load resource: 500',
        url: 'https://app.test/api/checkout',
        line: 1
      }
    ])
  })

  test('stamps an uncaught exception, because CDP gives it no level at all', () => {
    const { console: lines } = collectRelayed([
      at('Runtime.exceptionThrown', {
        exceptionDetails: {
          text: 'Uncaught',
          exception: { description: 'TypeError: cannot read total of undefined' },
          stackTrace: { callFrames: [{ url: 'https://app.test/cart.js', lineNumber: 9 }] }
        }
      })
    ])
    expect(lines[0]).toMatchObject({ level: 'uncaught', text: 'TypeError: cannot read total of undefined' })
    expect(hasErrors(collectRelayed([at('Runtime.exceptionThrown', { exceptionDetails: {} })]))).toBe(true)
  })

  test('drops the oldest when a page floods, because the tail is where the bug is', () => {
    const flood = Array.from({ length: 5200 }, (_, i) =>
      at('Runtime.consoleAPICalled', { type: 'log', args: [{ value: `line ${i}` }] })
    )
    const { console: lines } = collectRelayed(flood)
    expect(lines).toHaveLength(5000)
    expect(lines.at(-1)!.text).toBe('line 5199')
  })

  test('an empty message is not a line', () => {
    expect(collectRelayed([at('Runtime.consoleAPICalled', { type: 'log', args: [] })]).console).toEqual([])
    expect(collectRelayed([at('Log.entryAdded', { entry: { level: 'error' } })]).console).toEqual([])
  })
})

describe('navigations', () => {
  test('records where the tester went', () => {
    const { navigations } = collectRelayed([
      at('Page.frameNavigated', { frame: { id: '1', url: 'https://app.test/checkout' } }, 4000)
    ])
    expect(navigations).toEqual([{ atMs: 4000, url: 'https://app.test/checkout' }])
  })

  test('ignores sub-frames, which navigate constantly and are not somewhere anyone went', () => {
    const { navigations } = collectRelayed([
      at('Page.frameNavigated', { frame: { id: '2', parentId: '1', url: 'https://ads.test/pixel' } })
    ])
    expect(navigations).toEqual([])
  })

  test.each(['about:blank', 'chrome://newtab', 'data:text/html,hi', ''])(
    'ignores %j, which is not a page under test',
    (url) => {
      expect(collectRelayed([at('Page.frameNavigated', { frame: { id: '1', url } })]).navigations).toEqual([])
    }
  )
})

describe('the HAR stream', () => {
  test('forwards Network and Page events in arrival order, untouched', () => {
    const events = [
      at('Network.requestWillBeSent', { requestId: '1', request: { url: 'https://app.test/a' } }),
      at('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'noise' }] }),
      at('Network.responseReceived', { requestId: '1', response: { status: 500 } }),
      at('Page.loadEventFired', { timestamp: 1 })
    ]
    const { harMessages } = collectRelayed(events)
    expect(harMessages.map((m) => m.method)).toEqual([
      'Network.requestWillBeSent',
      'Network.responseReceived',
      'Page.loadEventFired'
    ])
    // Untouched: chrome-har reads fields this module has no opinion about.
    expect(harMessages[0]!.params).toBe(events[0]!.params)
  })

  test('survives a malformed event rather than losing the whole stream', () => {
    const { console: lines, harMessages } = collectRelayed([
      at('Runtime.consoleAPICalled', null),
      at('Log.entryAdded', 'not an object'),
      at('Page.frameNavigated', { frame: null }),
      at('Network.requestWillBeSent', { requestId: '1' }),
      at('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'still here' }] })
    ])
    expect(lines.map((l) => l.text)).toEqual(['still here'])
    // Both the Network and the Page event are forwarded even though the Page one is
    // unreadable here: what chrome-har can use is chrome-har's decision, and
    // `harFromMessages` is already wrapped against a stream it cannot parse.
    expect(harMessages.map((m) => m.method)).toEqual(['Page.frameNavigated', 'Network.requestWillBeSent'])
  })
})
