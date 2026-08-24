import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core'
import { harFromMessages } from 'chrome-har'
import { LANDING_PAGE, cdpEndpoint, chromeCandidates, launchArgs } from './chrome'
import { redactHar } from './redact'
import { MAX_BODIES, attachResponseBodies, isFailedStatus, trimHarBefore, type ResponseBody } from './har'
import {
  BINDING_NAME,
  INJECTED_SCRIPT,
  appendAction,
  normalizeAction,
  prepareSnapshot,
  type ActionRecord
} from './actions'

/**
 * The browser-side collector: launches Chrome with a debugging port, attaches over CDP,
 * and records what a screenshot cannot show — the console, the network, and where the
 * tester went.
 *
 * Chrome is launched rather than attached to, because Chrome refuses remote debugging on
 * the default profile. The profile it does use is persisted, so logging in to the app
 * under test is a once-per-machine cost rather than once-per-session.
 */

const DEFAULT_PORT = 47334
const READY_TIMEOUT_MS = 15_000
const READY_POLL_MS = 200
/** Console output is unbounded in principle; a chatty page must not exhaust memory. */
const MAX_CONSOLE_ENTRIES = 5000
/**
 * How long to let the page settle before snapshotting what an action changed. Too short
 * and the snapshot is the old DOM; too long and fast clicking blurs two actions together.
 */
const SETTLE_MS = 250

/** The CDP events chrome-har needs to reconstruct a HAR. */
const NETWORK_EVENTS = [
  'Network.requestWillBeSent',
  'Network.requestWillBeSentExtraInfo',
  'Network.responseReceived',
  'Network.responseReceivedExtraInfo',
  'Network.dataReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
  'Network.requestServedFromCache',
  'Network.resourceChangedPriority'
] as const

const PAGE_EVENTS = [
  'Page.frameAttached',
  'Page.frameStartedLoading',
  'Page.frameScheduledNavigation',
  'Page.navigatedWithinDocument',
  'Page.domContentEventFired',
  'Page.loadEventFired'
] as const

export type ConsoleEntry = {
  atMs: number
  level: string
  text: string
  url?: string
  line?: number
}

export type NavigationEntry = { atMs: number; url: string }

export type CollectedSession = {
  startedAt: string
  durationMs: number
  console: ConsoleEntry[]
  navigations: NavigationEntry[]
  actions: ActionRecord[]
  /** HAR 1.2, with credentials already stripped. */
  har: unknown
}

export type CollectorHandle = {
  endpoint: string
  /**
   * Throw away everything collected so far and restart the clock: the capture begins
   * now. Getting to the broken page — signing in, navigating, picking an account — is
   * not part of the flow being captured, and leaving it in means a trail that opens
   * with twenty steps of setup and a HAR that is mostly auth traffic.
   */
  beginCapture: () => void
  stop: () => Promise<CollectedSession>
}

export type CollectorOptions = {
  /**
   * Persisted between sessions so a tester logs in once. Supplied by the caller rather
   * than read from electron here, which keeps this module runnable outside the app.
   */
  profileDir: string
  startUrl?: string
  port?: number
}

export function resolveChromePath(): string {
  const found = chromeCandidates(process.platform, process.env).find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      'No Chrome, Chromium or Edge installation found. The collector attaches to a browser you already have; it does not download one.'
    )
  }
  return found
}

async function waitForCdp(endpoint: string, signal: { killed: boolean }): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal.killed) throw new Error('Chrome exited before its debugging port came up')
    try {
      const res = await fetch(`${endpoint}/json/version`)
      if (res.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }
  throw new Error(`Chrome's debugging port did not come up within ${READY_TIMEOUT_MS}ms`)
}

/** Best-effort readable text for a console argument, without evaluating anything in the page. */
function describeArg(arg: { value?: unknown; description?: string; type?: string }): string {
  if (arg.description) return arg.description
  if (arg.value === undefined) return arg.type ?? 'undefined'
  return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)
}

export async function startCollector(opts: CollectorOptions): Promise<CollectorHandle> {
  const port = opts.port ?? DEFAULT_PORT
  const endpoint = cdpEndpoint(port)
  const chromePath = resolveChromePath()
  const { profileDir } = opts
  await mkdir(profileDir, { recursive: true })

  // Launch blank and navigate only once CDP is attached. Chrome starts fetching the
  // moment it has a URL, and Network.enable is per-session — handing it the target URL
  // up front loses every request the first page load makes, which is most of them.
  const child: ChildProcess = spawn(chromePath, launchArgs({ port, profileDir, startUrl: LANDING_PAGE }), {
    stdio: 'ignore',
    detached: false
  })
  const state = { killed: false }
  child.on('exit', () => {
    state.killed = true
  })

  let startedAt = new Date()
  let startedPerf = Date.now()
  const messages: { method: string; params: unknown }[] = []
  const consoleEntries: ConsoleEntry[] = []
  const navigations: NavigationEntry[] = []
  let actions: ActionRecord[] = []
  // Bodies for failed requests only, fetched separately because CDP events never carry
  // them. Keyed by request id, which is what chrome-har puts on each HAR entry.
  const bodies: Record<string, ResponseBody> = {}
  const failedRequestIds = new Set<string>()
  /** Wall clock of the capture's start; requests before it belong to setup. */
  let captureFromMs = 0
  const attached = new WeakSet<Page>()
  // Kept so beginCapture can seed the trail with wherever setup left the browser.
  let primaryPage: Page | null = null
  // ariaSnapshot is a round trip to the page; serialise them so a burst of clicks
  // cannot pile up concurrent calls on a page that is still navigating.
  let snapshots: Promise<void> = Promise.resolve()
  let browser: Browser | null = null

  const since = (): number => Date.now() - startedPerf

  const pushConsole = (entry: ConsoleEntry): void => {
    // Drop the oldest rather than the newest: the tail is what the bug is in.
    if (consoleEntries.length >= MAX_CONSOLE_ENTRIES) consoleEntries.shift()
    consoleEntries.push(entry)
  }

  const attachPage = async (page: Page): Promise<void> => {
    if (attached.has(page)) return
    attached.add(page)
    primaryPage ??= page
    let cdp: CDPSession
    try {
      cdp = await page.context().newCDPSession(page)
    } catch (err) {
      console.warn('[snapit] could not attach CDP to a page:', err)
      return
    }

    for (const event of [...NETWORK_EVENTS, ...PAGE_EVENTS]) {
      cdp.on(event as never, (params: unknown) => messages.push({ method: event, params }))
    }

    // Note which requests failed as their responses arrive, then fetch the body once
    // loading has finished — asking earlier can return a partial body or nothing.
    cdp.on('Network.responseReceived', (e) => {
      if (isFailedStatus(e.response?.status) && failedRequestIds.size < MAX_BODIES) {
        failedRequestIds.add(e.requestId)
      }
    })

    cdp.on('Network.loadingFinished', (e) => {
      if (!failedRequestIds.has(e.requestId) || bodies[e.requestId]) return
      void cdp
        .send('Network.getResponseBody', { requestId: e.requestId })
        .then((r) => {
          bodies[e.requestId] = { text: r.body, base64Encoded: r.base64Encoded }
        })
        .catch(() => {
          // Chrome evicts bodies aggressively, and a navigation drops them all. A
          // missing body is not worth failing a capture over.
        })
    })

    cdp.on('Runtime.consoleAPICalled', (e) => {
      pushConsole({
        atMs: since(),
        level: e.type,
        text: (e.args ?? []).map(describeArg).join(' '),
        url: e.stackTrace?.callFrames?.[0]?.url,
        line: e.stackTrace?.callFrames?.[0]?.lineNumber
      })
    })

    cdp.on('Runtime.exceptionThrown', (e) => {
      const d = e.exceptionDetails
      pushConsole({
        atMs: since(),
        level: 'uncaught',
        text: d.exception?.description ?? d.text,
        url: d.url,
        line: d.lineNumber
      })
    })

    // Browser-level problems the page's own console never sees: blocked mixed content,
    // CSP violations, failed subresource loads.
    cdp.on('Log.entryAdded', (e) => {
      pushConsole({ atMs: since(), level: e.entry.level, text: e.entry.text, url: e.entry.url })
    })

    // The action trail. The binding is a global the page can call with anything, so
    // every payload goes through normalizeAction before it is believed.
    try {
      await cdp.send('Runtime.addBinding', { name: BINDING_NAME })
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_SCRIPT })
      // addScriptToEvaluateOnNewDocument only affects the *next* document; the one
      // already open needs it evaluated directly.
      await cdp.send('Runtime.evaluate', { expression: INJECTED_SCRIPT })
    } catch (err) {
      console.warn('[snapit] could not install the action listener:', err)
    }

    cdp.on('Runtime.bindingCalled', (e) => {
      if (e.name !== BINDING_NAME) return
      let payload: unknown
      try {
        payload = JSON.parse(e.payload)
      } catch {
        return // Not ours, or a page poking at the binding.
      }
      const record = normalizeAction(payload, since())
      if (!record) return
      actions = appendAction(actions, record)
      // Mutating the record rather than indexing the list: appendAction returns a new
      // array, and the cap can shift every index out from under us.
      snapshots = snapshots.then(async () => {
        await new Promise((r) => setTimeout(r, SETTLE_MS))
        try {
          record.ariaAfter = prepareSnapshot(await page.locator('body').ariaSnapshot())
        } catch {
          // Page navigated or closed mid-snapshot; the action itself is still worth having.
        }
      })
    })

    cdp.on('Page.frameNavigated', (e) => {
      if (e.frame.parentId) return // Sub-frames are noise in a navigation trail.
      navigations.push({ atMs: since(), url: e.frame.url })
    })

    try {
      await Promise.all([
        cdp.send('Runtime.enable'),
        cdp.send('Network.enable'),
        cdp.send('Page.enable'),
        cdp.send('Log.enable')
      ])
    } catch (err) {
      console.warn('[snapit] could not enable CDP domains on a page:', err)
    }
  }

  const attachContext = async (context: BrowserContext): Promise<void> => {
    context.on('page', (page) => void attachPage(page))
    await Promise.all(context.pages().map((page) => attachPage(page)))
  }

  try {
    await waitForCdp(endpoint, state)
    browser = await chromium.connectOverCDP(endpoint)
    await Promise.all(browser.contexts().map((c) => attachContext(c)))

    if (opts.startUrl) {
      const page = browser.contexts()[0]?.pages()[0]
      // 'commit' rather than 'load': this resolves as soon as navigation begins, so
      // starting a session does not block on however slow the app under test is.
      await page?.goto(opts.startUrl, { waitUntil: 'commit' })
    }
  } catch (err) {
    child.kill()
    throw err
  }

  const beginCapture = (): void => {
    // messages is deliberately NOT cleared: chrome-har needs the frame lifecycle events
    // that came before a request to map it to a page, and without them it drops the
    // request entirely. The HAR is trimmed by timestamp at the end instead.
    captureFromMs = Date.now()
    consoleEntries.length = 0
    navigations.length = 0
    actions = []
    failedRequestIds.clear()
    for (const key of Object.keys(bodies)) delete bodies[key]
    startedAt = new Date()
    startedPerf = Date.now()
    // Without this the spec has no page.goto: the navigation that got here was
    // discarded with the rest of the setup.
    const url = primaryPage?.url()
    if (url && /^https?:/.test(url)) navigations.push({ atMs: 0, url })
  }

  const stop = async (): Promise<CollectedSession> => {
    const durationMs = since()
    // Let any in-flight snapshot finish, so the last action is not left bare.
    await Promise.race([snapshots, new Promise((r) => setTimeout(r, SETTLE_MS * 4))])
    try {
      // Disconnects the CDP client; it does not close a browser we spawned ourselves.
      await browser?.close()
    } catch {
      // Already gone.
    }
    child.kill()

    let har: unknown = { log: { version: '1.2', entries: [] } }
    try {
      const built = harFromMessages(messages, { includeTextFromResponseBody: false }) as {
        log?: { entries?: [] }
      }
      har = attachResponseBodies(trimHarBefore(built, captureFromMs), bodies)
    } catch (err) {
      // A malformed event stream must not lose the console and navigation trail too.
      console.error('[snapit] could not build a HAR from the collected events:', err)
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

  return { endpoint, beginCapture, stop }
}
