/**
 * Turning MCP activity into something the sidebar can say truthfully.
 *
 * The first version asked "how many transports are open right now", which for a
 * streamable-HTTP server is almost always zero: a client posts, gets its reply, and the
 * session closes. So a correctly configured Claude Code read as "not attached" except
 * during the milliseconds of a call, which is the opposite of useful.
 *
 * "Connected" therefore means *recently used*, and the window is generous on purpose —
 * an agent that read a capture five minutes ago is still connected in every sense the
 * reader cares about. Pure, so the boundaries are testable.
 */

/** A request inside this window counts as connected. Long, because idle is not gone. */
export const MCP_IDLE_MS = 15 * 60 * 1000

export type McpState =
  /** A transport is open this instant — mid-call. */
  | { state: 'live'; sessions: number }
  /** Nothing open, but it has been used recently enough to still be set up. */
  | { state: 'idle'; sinceMs: number }
  /** Used at some point, but not lately. */
  | { state: 'stale'; sinceMs: number }
  /** Never seen a request: not configured, or configured and never used. */
  | { state: 'never' }

export function mcpState(
  activity: { sessions: number; lastRequestAt: number | null },
  now: number = Date.now()
): McpState {
  if (activity.sessions > 0) return { state: 'live', sessions: activity.sessions }
  if (activity.lastRequestAt === null) return { state: 'never' }
  const sinceMs = Math.max(0, now - activity.lastRequestAt)
  return sinceMs <= MCP_IDLE_MS ? { state: 'idle', sinceMs } : { state: 'stale', sinceMs }
}

/** Whether to draw the dot as connected. `stale` is not: it may have been uninstalled. */
export const isMcpConnected = (s: McpState): boolean => s.state === 'live' || s.state === 'idle'
