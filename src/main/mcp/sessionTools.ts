import { basename } from 'path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { BUNDLE_FILES, type CaptureMeta } from '../bundle'
import type { ActionRecord } from '../collector/actions'
import type { ConsoleEntry } from '../collector/session'
import { getSettings } from '../settings'
import { readBundleJson, targetBundle } from './bundles'
import { stepDetail, summariseConsole, summariseFailedRequests, summariseSteps } from './summarise'

/**
 * MCP tools for browser sessions and the bundles they produce.
 *
 * Kept apart from the screenshot tools because they answer a different question: not
 * "what does the screen look like" but "what did the application actually do".
 *
 * Every one of these is compact by design. A real session holds hundreds of console
 * lines, a HAR of a few hundred requests and an ARIA snapshot per action; returning
 * that raw would spend a context window on noise. The steps list carries no selectors
 * and no snapshots, and `get_steps` with a `step` is how the detail is fetched — the
 * same discipline `include_image` already applies to screenshots.
 */

export type SessionHooks = {
  /** Launch Chrome under snapit's control. Rejects if one is already running. */
  startBrowserSession: (url?: string) => Promise<void>
  /** Stop and write the bundle. Resolves with its folder, or null if none was running. */
  stopBrowserSession: () => Promise<string | null>
  isBrowserSessionActive: () => boolean
}

const bundleParam = z
  .string()
  .optional()
  .describe(
    'Bundle folder name, as listed by recent_captures. Defaults to the most recent bundle, which is almost always the one you want.'
  )

const limitParam = (fallback: number): z.ZodOptional<z.ZodNumber> =>
  z.number().int().positive().max(200).optional().describe(`Default ${fallback}, max 200.`)

const text = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})

async function loadActions(dir: string): Promise<ActionRecord[]> {
  const file = await readBundleJson<{ actions?: ActionRecord[] }>(dir, BUNDLE_FILES.actions)
  return file?.actions ?? []
}

export function registerSessionTools(server: McpServer, hooks: SessionHooks): void {
  server.registerTool(
    'start_browser_session',
    {
      title: 'Start a browser session',
      description:
        "Open Chrome under snapit's control and start recording what it does: console, network, " +
        'navigations, and every click and form fill with the selectors needed to write a test for ' +
        'them. Use this when you need to know why something fails in a browser rather than what it ' +
        'looks like. The user drives; call stop_browser_session when they say they are done.',
      inputSchema: {
        url: z.string().url().optional().describe('Page to open. Omitted, the browser starts blank.')
      }
    },
    async ({ url }) => {
      await hooks.startBrowserSession(url)
      return text(
        `Browser session started${url ? ` at ${url}` : ''}. Ask the user to reproduce the problem, ` +
          'then call stop_browser_session.'
      )
    }
  )

  server.registerTool(
    'stop_browser_session',
    {
      title: 'Stop the browser session',
      description:
        'Stop the running session and write its bundle (console, network HAR, action trail, report). ' +
        'Returns the bundle name and a count of what was collected; use get_console_errors, ' +
        'get_failed_requests and get_steps to look inside.',
      inputSchema: {}
    },
    async () => {
      const dir = await hooks.stopBrowserSession()
      if (!dir) return text('No browser session was running.')
      const meta = await readBundleJson<CaptureMeta>(dir, BUNDLE_FILES.meta)
      return text({ bundle: basename(dir), path: dir, collected: meta?.collected ?? null })
    }
  )

  server.registerTool(
    'get_session_summary',
    {
      title: 'Summarise a capture bundle',
      description:
        'What a bundle holds: kind, duration, environment, and how many console errors, failed ' +
        'requests and actions it recorded. Start here, then drill into whichever count is not zero.',
      inputSchema: { bundle: bundleParam }
    },
    async ({ bundle }) => {
      const dir = await targetBundle(getSettings().saveDir, bundle)
      const meta = await readBundleJson<CaptureMeta>(dir, BUNDLE_FILES.meta)
      if (!meta) return text(`No readable metadata in ${basename(dir)}.`)
      return text({
        bundle: basename(dir),
        kind: meta.capture.kind,
        capturedAt: meta.capturedAt,
        durationMs: meta.capture.durationMs,
        media: meta.media?.file ?? null,
        markers: meta.capture.markers.length,
        collected: meta.collected ?? null,
        system: meta.system,
        snapit: meta.app.version
      })
    }
  )

  server.registerTool(
    'get_console_errors',
    {
      title: 'Console errors from a session',
      description:
        'Errors, uncaught exceptions and warnings from a browser session, with identical messages ' +
        'collapsed into one line and a count. Info-level chatter is left out unless you ask for it.',
      inputSchema: {
        bundle: bundleParam,
        limit: limitParam(30),
        include_all: z
          .boolean()
          .optional()
          .describe('Include logs and info too. Off by default — it is mostly noise.')
      }
    },
    async ({ bundle, limit, include_all }) => {
      const dir = await targetBundle(getSettings().saveDir, bundle)
      const entries = await readBundleJson<ConsoleEntry[]>(dir, BUNDLE_FILES.console)
      if (!entries) return text(`${basename(dir)} has no console data — it is not a browser session.`)
      const lines = summariseConsole(entries, { limit, includeAll: include_all })
      return text(lines.length > 0 ? lines : 'No console errors or warnings were recorded.')
    }
  )

  server.registerTool(
    'get_failed_requests',
    {
      title: 'Failed requests from a session',
      description:
        'Requests that returned 4xx or 5xx, or failed outright, from a session HAR. Method, status ' +
        'and URL only — the full HAR sits in the bundle if you need headers or timings.',
      inputSchema: { bundle: bundleParam, limit: limitParam(30) }
    },
    async ({ bundle, limit }) => {
      const dir = await targetBundle(getSettings().saveDir, bundle)
      const har = await readBundleJson<unknown>(dir, BUNDLE_FILES.har)
      if (!har) return text(`${basename(dir)} has no network data — it is not a browser session.`)
      const failed = summariseFailedRequests(har, limit)
      return text(failed.length > 0 ? failed : 'Every request in this session succeeded.')
    }
  )

  server.registerTool(
    'get_steps',
    {
      title: 'Steps taken during a session',
      description:
        'What the user actually did, one line per step — the repro steps. Pass a step number to get ' +
        "that step's full detail instead: every selector candidate for the element, ranked, plus an " +
        'ARIA snapshot of the page after the action settled. The snapshot is what an assertion is ' +
        'derived from; the list deliberately omits both so it stays cheap to read.',
      inputSchema: {
        bundle: bundleParam,
        step: z.number().int().positive().optional().describe('1-based step number, as shown in the list.'),
        limit: limitParam(100)
      }
    },
    async ({ bundle, step, limit }) => {
      const dir = await targetBundle(getSettings().saveDir, bundle)
      const actions = await loadActions(dir)
      if (actions.length === 0) {
        return text(`${basename(dir)} recorded no actions — it is not a browser session.`)
      }
      if (step === undefined) return text(summariseSteps(actions, limit))
      const detail = stepDetail(actions, step)
      return text(detail ?? `There is no step ${step}; this session has ${actions.length}.`)
    }
  )
}
