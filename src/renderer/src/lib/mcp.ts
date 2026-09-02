import type { ShellStatus } from '@preload/index'

/**
 * How the MCP connection reads on screen.
 *
 * Kept out of the three components that show it — the sidebar dot, the Overview's nudge
 * and the Claude Code route — so they cannot disagree about what "connected" means.
 *
 * That meaning is deliberately generous: the transport closes between calls, so an agent
 * that read a capture two minutes ago has nothing open and is connected in every sense
 * the reader cares about. Reporting live sockets is what made a working setup say "not
 * attached" for all but the milliseconds of a request.
 */

export type Mcp = ShellStatus['mcp']

export const isConnected = (mcp: Mcp): boolean => mcp.state === 'live' || mcp.state === 'idle'

const ago = (ms: number): string => {
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'moments ago'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** The sidebar's one line. Short, because it sits under two others. */
export function mcpLabel(mcp: Mcp): string {
  switch (mcp.state) {
    case 'live':
      return mcp.sessions > 1 ? `Claude Code reading ×${mcp.sessions}` : 'Claude Code reading now'
    case 'idle':
      return 'Claude Code connected'
    case 'stale':
      return `Claude Code idle · ${ago(mcp.sinceMs)}`
    default:
      return 'Claude Code not set up'
  }
}

/** The Claude Code route's fuller version, where there is room to say when. */
export function mcpDetail(mcp: Mcp): { value: string; note: string } {
  switch (mcp.state) {
    case 'live':
      return { value: `${mcp.sessions} reading now`, note: 'mid-request' }
    case 'idle':
      return { value: 'Connected', note: `last read ${ago(mcp.sinceMs)}` }
    case 'stale':
      return { value: 'Idle', note: `last read ${ago(mcp.sinceMs)}` }
    default:
      return { value: 'Not set up', note: 'run the command below' }
  }
}
