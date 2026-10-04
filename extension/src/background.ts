/**
 * The snapit collector, as a Chrome extension.
 *
 * Replaces launching a second browser. `DESIGN.md` §3 originally called for exactly this —
 * "QA keeps their real authenticated Chrome (real app logins/cookies)" — and M1.3 traded it
 * away for a snapit-launched profile because an extension was more work. This buys it back:
 * the tab being recorded is the tab the tester is already signed in to.
 *
 * **The reason it is cheap: `chrome.debugger` speaks CDP.** The same `Network.*` and
 * `Page.*` events the old collector subscribed to arrive here with the same names and the
 * same params, so `chrome-har`, `redact.ts` and `har.ts` in the desktop app consume them
 * unchanged. Only the attach changes.
 *
 * Two deliberate choices worth knowing:
 *
 * - **HTTP batches, not a WebSocket.** A socket is the usual MV3 keep-alive, but it needs a
 *   server dependency the app does not have, and a `fetch` inside the 30-second idle window
 *   resets the worker's timer just as well. The flush interval is therefore load-bearing:
 *   it is the keep-alive, not only a batching optimisation.
 * - **Nothing is interpreted here.** Events are forwarded raw. Every rule about what a HAR
 *   contains and what gets redacted already lives in the app and is tested there; a second
 *   copy in an extension that updates on Chrome's schedule is how the two drift.
 */

const PROTOCOL_VERSION = '1.3'

/** Under the 30s MV3 idle timeout with room to spare, and small enough to feel live. */
const FLUSH_MS = 1000

/** The CDP domains the app's collector reconstructs a session from. */
const DOMAINS = ['Network.enable', 'Page.enable', 'Runtime.enable', 'Log.enable'] as const

/**
 * The events the app actually needs, and the one that is easy to get wrong.
 *
 * `chrome-har` creates a page only from `frameStartedLoading`, `frameRequestedNavigation`
 * or `navigatedWithinDocument` — **not** from `frameNavigated`. Forward only the latter and
 * every request lands in its `entriesWithoutPage` bucket and is silently dropped: a HAR
 * with zero entries and no error. Found by `collector/tests/relayedHar.spec.ts`, which
 * exists for exactly this.
 *
 * `frameNavigated` is still forwarded, because it is the one that carries the URL the
 * navigation trail shows. The two are not interchangeable and both are required.
 */
const FORWARDED = [
  'Network.',
  'Page.frameAttached',
  'Page.frameStartedLoading',
  'Page.frameRequestedNavigation',
  'Page.frameScheduledNavigation',
  'Page.frameNavigated',
  'Page.navigatedWithinDocument',
  'Page.domContentEventFired',
  'Page.loadEventFired',
  'Runtime.consoleAPICalled',
  'Runtime.exceptionThrown',
  'Log.entryAdded'
] as const

const wanted = (method: string): boolean =>
  FORWARDED.some((prefix) => (prefix.endsWith('.') ? method.startsWith(prefix) : method === prefix))

type Bridge = { port: number; token: string }

type Relayed = { method: string; params: unknown; atMs: number }

type Session = {
  tabId: number
  startedAt: number
  queue: Relayed[]
  timer: ReturnType<typeof setInterval> | null
}

let session: Session | null = null

const bridgeUrl = (bridge: Bridge, path: string): string => `http://127.0.0.1:${bridge.port}${path}`

async function bridge(): Promise<Bridge | null> {
  const stored = await chrome.storage.local.get(['port', 'token'])
  if (typeof stored.port !== 'number' || typeof stored.token !== 'string') return null
  return { port: stored.port, token: stored.token }
}

async function post(path: string, body: unknown): Promise<Response | null> {
  const target = await bridge()
  if (!target) return null
  try {
    return await fetch(bridgeUrl(target, path), {
      method: 'POST',
      headers: { authorization: `Bearer ${target.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    // The app is closed or the port moved. Dropping the batch is correct: the alternative
    // is an unbounded queue in a worker Chrome may kill at any moment.
    return null
  }
}

/**
 * Send what has accumulated.
 *
 * Runs on the interval even when the queue is empty, because the request is what keeps the
 * service worker alive — see the note at the top. An empty batch is a heartbeat.
 */
async function flush(): Promise<void> {
  if (!session) return
  const batch = session.queue
  session.queue = []
  const res = await post('/collector/events', {
    tabId: session.tabId,
    startedAt: session.startedAt,
    events: batch
  })
  // The app saying it no longer knows this session means the capture was stopped there —
  // detach rather than keep debugging a tab nobody is collecting.
  if (res && res.status === 410) await stop()
}

function onEvent(source: chrome.debugger.Debuggee, method: string, params?: object): void {
  if (!session || source.tabId !== session.tabId) return
  // Filtered here rather than in the app: a busy page emits thousands of events a minute
  // and most of them are ones nothing downstream reads. The filter is a list of names, not
  // a judgement — anything kept is forwarded untouched.
  if (!wanted(method)) return
  session.queue.push({ method, params: params ?? {}, atMs: Date.now() - session.startedAt })
}

function onDetach(source: chrome.debugger.Debuggee, reason: string): void {
  if (!session || source.tabId !== session.tabId) return
  // `canceled_by_user` is the tester clicking Cancel on the debugging infobar, which is a
  // legitimate way to stop and must not look like a crash.
  console.warn(`[snapit] detached from tab ${source.tabId}: ${reason}`)
  void stop(reason)
}

export async function start(tabId: number): Promise<void> {
  if (session) await stop('restarted')

  await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION)
  for (const domain of DOMAINS) await chrome.debugger.sendCommand({ tabId }, domain)

  session = { tabId, startedAt: Date.now(), queue: [], timer: null }
  session.timer = setInterval(() => void flush(), FLUSH_MS)
  await post('/collector/start', { tabId, startedAt: session.startedAt })
  await chrome.action.setBadgeText({ text: 'REC' })
  await chrome.action.setBadgeBackgroundColor({ color: '#c0392b' })
}

export async function stop(reason = 'stopped'): Promise<void> {
  const ending = session
  session = null
  if (!ending) return
  if (ending.timer) clearInterval(ending.timer)

  // Flush what is left before detaching: the last requests are usually the reason somebody
  // pressed stop, which is the same finding that gave the old collector its drain window.
  if (ending.queue.length > 0) {
    await post('/collector/events', {
      tabId: ending.tabId,
      startedAt: ending.startedAt,
      events: ending.queue
    })
  }
  await post('/collector/stop', { tabId: ending.tabId, reason })
  try {
    await chrome.debugger.detach({ tabId: ending.tabId })
  } catch {
    // Already gone — the tab closed, or Chrome detached us first.
  }
  await chrome.action.setBadgeText({ text: '' })
}

chrome.debugger.onEvent.addListener(onEvent)
chrome.debugger.onDetach.addListener(onDetach)

/** Clicking the toolbar button records the tab you are looking at. */
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  void (session && session.tabId === tab.id ? stop() : start(tab.id))
})

/** The app pairs by writing its port and token in, so nothing is hardcoded. */
chrome.runtime.onMessageExternal.addListener((message, _sender, reply) => {
  if (message?.type === 'pair' && typeof message.port === 'number' && typeof message.token === 'string') {
    void chrome.storage.local
      .set({ port: message.port, token: message.token })
      .then(() => reply({ ok: true }))
    return true
  }
  return false
})

export const inspect = (): { tabId: number; queued: number } | null =>
  session ? { tabId: session.tabId, queued: session.queue.length } : null
