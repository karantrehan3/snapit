import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { harFromMessages } from 'chrome-har'
import { collectRelayed, type RelayedEvent } from './relayed'
import { attachResponseBodies, trimHarBefore } from './har'
import { BINDING_NAME, INJECTED_SCRIPT } from './actions'
import { redactHar } from './redact'
import { checkCollectorRequest, isOurExtension, versionsAgree, type AuthOutcome } from './bridgeAuth'
import type { CollectedSession, CollectorHandle } from './session'

/**
 * The app's half of the Chrome extension collector.
 *
 * A loopback HTTP server the extension posts batches of CDP events to. Deliberately its
 * own listener rather than a path on the MCP server: that one is strictly MCP and 404s
 * everything else, and the two have different clients, different tokens and different
 * reasons to be revoked.
 *
 * **The lifecycle runs the other way round from the launched collector**, and that is the
 * thing to hold onto. snapit starts a browser and then owns the session; here the person
 * clicks record in the browser they are already working in, and the app is *told* a session
 * began. So this does not expose a `start` — it exposes a notification, and hands back a
 * `CollectorHandle` so everything downstream of the two collectors stays identical.
 *
 * Bound to 127.0.0.1 explicitly, like the MCP server, rather than trusting a default — the
 * prototype server in `server/` shipped bound to every interface precisely because that was
 * left implicit.
 */

const LOOPBACK = '127.0.0.1'

/** Sits beside the MCP server's 47317. */
export const DEFAULT_BRIDGE_PORT = 47318

/**
 * A relayed session must not grow without bound: a tab left recording overnight would
 * otherwise hold every event it ever saw. Oldest first — the end is where the bug is.
 */
const MAX_EVENTS = 200_000

export type BridgeHooks = {
  /** The token the extension must present. Read per request so a rotation takes effect. */
  token: () => string
  /** From `extension/EXTENSION_ID`. */
  extensionId: () => string
  /**
   * The extension is asking to connect. Resolve true to hand it a token.
   *
   * Asked in the moment rather than armed in advance. The previous design had somebody
   * press "Open pairing" in the app and *then* click in Chrome, which is two steps in two
   * applications to answer one question, and nobody could tell what the first step was
   * for. Now the question is asked when it is live, where a yes or no is obvious.
   *
   * Safe to raise a dialog from a request only because the origin check has already run:
   * the sole thing that can reach this is something presenting snapit's own pinned
   * extension id. The app rate-limits anyway — see `index.ts`.
   */
  requestPairing: () => Promise<boolean>
  /** The extension version this build of the app speaks to. */
  expectedExtensionVersion: string
  /**
   * A session began in the browser. The handle is how the app collects it.
   *
   * Returns false when the app cannot take it — it is already recording something else.
   * The bridge then drops the session rather than quietly filling a buffer nobody will
   * ever read, and the extension is told to detach.
   */
  onSessionStart: (handle: CollectorHandle, info: { tabId: number; version: string }) => boolean
  /** The extension stopped, or the tab went away. */
  onSessionEnd: (reason: string) => void
  /** The extension is a version this app does not speak to. */
  onVersionMismatch: (found: string, expected: string) => void
}

type Live = {
  tabId: number
  startedAt: Date
  events: RelayedEvent[]
  /** Set by `beginCapture`; events before it belong to getting to the bug. */
  fromMs: number
}

let server: Server | null = null
let live: Live | null = null

const json = (res: ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

const deny = (res: ServerResponse, outcome: Extract<AuthOutcome, { ok: false }>): void =>
  json(res, outcome.status, { ok: false, error: outcome.why })

async function readBody(req: IncomingMessage, max = 8_000_000): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    // A batch is events, not a recording. Anything this large is wrong.
    if (total > max) throw new Error('Batch too large.')
    chunks.push(chunk as Buffer)
  }
  if (total === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
}

/**
 * Assemble what was relayed into the shape every other reader already understands.
 *
 * `harFromMessages` throws on a stream it cannot parse — seen for real with a response
 * missing `protocol` — so a malformed HAR must not take the console and the trail with it.
 */
export function assembleSession(
  events: readonly RelayedEvent[],
  startedAt: Date,
  durationMs: number,
  /** Wall-clock cutoff from `beginCapture`; earlier requests were getting to the bug. */
  captureFromMs = 0
): CollectedSession {
  const { console: consoleEntries, navigations, actions, bodies, harMessages } = collectRelayed(events)

  let har: unknown = { log: { version: '1.2', entries: [] } }
  try {
    const built = harFromMessages(harMessages, { includeTextFromResponseBody: false })
    // Trimmed here rather than by dropping events, which is the mistake `trimHarBefore`
    // documents: chrome-har maps each request to a page using the frame lifecycle events
    // that came before it, so discarding those makes every later request unmappable and
    // silently loses it. The stream stays whole; the built HAR is filtered.
    har = attachResponseBodies(trimHarBefore(built as never, captureFromMs), bodies)
  } catch (err) {
    // A malformed stream must not take the console and the trail with it.
    console.error('[snapit] could not build a HAR from the relayed events:', err)
  }

  return {
    startedAt: startedAt.toISOString(),
    durationMs,
    console: consoleEntries,
    navigations,
    actions,
    har: redactHar(har as { log?: { entries?: [] } })
  }
}

/** The handle for a session the extension is driving. */
function handleFor(current: Live): CollectorHandle {
  return {
    // There is no CDP endpoint to hand anybody: the browser is the tester's own.
    endpoint: '',
    beginCapture: () => {
      // The events are kept. Clearing them is the obvious move and it is wrong — see the
      // note in `assembleSession`. What is recorded is the wall clock to filter at.
      current.fromMs = Date.now()
      // Actions and console lines from before the capture are noise rather than
      // unmappable, so those are dropped where the HAR's entries are merely filtered.
      current.events = current.events.filter(
        (e) => e.method.startsWith('Network.') || e.method.startsWith('Page.')
      )
    },
    stop: async () => {
      const durationMs = Date.now() - current.startedAt.getTime()
      const assembled = assembleSession(current.events, current.startedAt, durationMs, current.fromMs)
      if (live === current) live = null
      return assembled
    }
  }
}

export function startCollectorBridge(hooks: BridgeHooks, port = DEFAULT_BRIDGE_PORT): void {
  if (server) return

  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK}`).pathname
    const origin = req.headers.origin

    void (async () => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only.' })

      if (path === '/collector/pair') {
        // Origin first, always: only snapit's own extension gets as far as asking a
        // person anything.
        if (!isOurExtension(origin, hooks.extensionId())) {
          return deny(res, { ok: false, status: 403, why: 'Not the snapit extension.' })
        }
        if (!(await hooks.requestPairing())) {
          return deny(res, { ok: false, status: 403, why: 'snapit declined the connection.' })
        }
        return json(res, 200, { ok: true, token: hooks.token(), expects: hooks.expectedExtensionVersion })
      }

      const outcome = checkCollectorRequest(
        origin,
        req.headers.authorization,
        hooks.extensionId(),
        hooks.token()
      )
      if (!outcome.ok) return deny(res, outcome)

      const body = await readBody(req)

      if (path === '/collector/start') {
        const tabId = typeof body.tabId === 'number' ? body.tabId : -1
        const version = typeof body.version === 'string' ? body.version : '0.0.0'
        if (!versionsAgree(version, hooks.expectedExtensionVersion)) {
          hooks.onVersionMismatch(version, hooks.expectedExtensionVersion)
          return json(res, 409, { ok: false, error: 'This snapit expects a different extension version.' })
        }
        const candidate: Live = { tabId, startedAt: new Date(), events: [], fromMs: 0 }
        live = candidate
        if (!hooks.onSessionStart(handleFor(candidate), { tabId, version })) {
          live = null
          return json(res, 409, { ok: false, error: 'snapit is already recording something else.' })
        }
        // The app owns the injected script and hands it over, rather than the extension
        // carrying a copy. One source for what an action is, in the place it is tested.
        return json(res, 200, { ok: true, bindingName: BINDING_NAME, injectedScript: INJECTED_SCRIPT })
      }

      if (path === '/collector/events') {
        // 410 tells the extension to detach: the app no longer knows this session, which
        // happens when the capture was stopped here rather than in the browser.
        if (!live) return json(res, 410, { ok: false, error: 'No session.' })
        const batch = Array.isArray(body.events) ? (body.events as RelayedEvent[]) : []
        for (const event of batch) {
          if (live.events.length >= MAX_EVENTS) live.events.shift()
          live.events.push(event)
        }
        return json(res, 200, { ok: true, received: batch.length })
      }

      if (path === '/collector/stop') {
        const reason = typeof body.reason === 'string' ? body.reason : 'stopped'
        hooks.onSessionEnd(reason)
        return json(res, 200, { ok: true })
      }

      return json(res, 404, { ok: false, error: 'No such route.' })
    })().catch((err: unknown) => {
      console.error('[snapit] collector bridge:', err)
      if (!res.headersSent) json(res, 500, { ok: false, error: 'Internal error.' })
    })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `[snapit] collector bridge port ${port} is in use; the Chrome extension cannot connect.`
        : `[snapit] collector bridge failed: ${err.message}`
    )
  })
  server.listen(port, LOOPBACK, () => console.log(`[snapit] collector bridge on ${LOOPBACK}:${port}`))
}

export function stopCollectorBridge(): void {
  live = null
  server?.close()
  server = null
}

/** For the app: is a browser-driven session running right now. */
export const bridgeSession = (): { tabId: number; events: number } | null =>
  live ? { tabId: live.tabId, events: live.events.length } : null
