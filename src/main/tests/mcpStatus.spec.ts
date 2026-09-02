import { describe, expect, it } from 'vitest'
import { MCP_IDLE_MS, isMcpConnected, mcpState } from '../mcpStatus'

const NOW = Date.parse('2026-09-03T12:00:00.000Z')
const agoMs = (ms: number): number => NOW - ms

describe('mcpState', () => {
  it('is live while a transport is open', () => {
    expect(mcpState({ sessions: 2, lastRequestAt: agoMs(10) }, NOW)).toEqual({ state: 'live', sessions: 2 })
  })

  it('stays connected between calls, which is the whole point', () => {
    // Streamable HTTP tears the session down after each reply, so `sessions` is 0 almost
    // always. Reporting that as "not attached" was the bug this module exists to fix.
    const s = mcpState({ sessions: 0, lastRequestAt: agoMs(90_000) }, NOW)
    expect(s.state).toBe('idle')
    expect(isMcpConnected(s)).toBe(true)
  })

  it('holds the connected reading right up to the window, and drops it after', () => {
    expect(isMcpConnected(mcpState({ sessions: 0, lastRequestAt: agoMs(MCP_IDLE_MS) }, NOW))).toBe(true)
    expect(isMcpConnected(mcpState({ sessions: 0, lastRequestAt: agoMs(MCP_IDLE_MS + 1) }, NOW))).toBe(false)
  })

  it('separates "never used" from "used a while ago"', () => {
    // They need different copy: one says set it up, the other says when it last ran.
    expect(mcpState({ sessions: 0, lastRequestAt: null }, NOW)).toEqual({ state: 'never' })
    expect(mcpState({ sessions: 0, lastRequestAt: agoMs(3 * 3600_000) }, NOW).state).toBe('stale')
  })

  it('never reports a negative age from a clock that moved', () => {
    const s = mcpState({ sessions: 0, lastRequestAt: NOW + 5_000 }, NOW)
    expect(s.state === 'idle' && s.sinceMs).toBe(0)
  })
})
