import { environmentLine, type CaptureManifest } from '../domain/manifest.ts'
import type { Capture } from '../domain/model.ts'

/**
 * A capture, as the thing an integration needs to say about it.
 *
 * This is the same idea as `src/main/markdown.ts` in the desktop app, and deliberately
 * so. That module's doc comment makes the argument the app was built on: *"snapit does
 * not talk to Jira, Linear or Slack: whoever is filing the ticket is already
 * authenticated to it, and a paste costs them one keystroke against an OAuth flow and a
 * token to keep alive here."* That argument is correct for a local tool and it is the
 * thing connected mode changes — not because pasting got worse, but because a *server*
 * can hold the workspace's Jira connection once instead of every developer holding it.
 *
 * So the boundary is drawn here: one neutral payload, and adapters that render it. The
 * payload knows nothing about ADF or Block Kit, and the adapters know nothing about
 * captures. That is what makes a third target — Linear, GitHub, Azure DevOps — a file
 * rather than a project.
 *
 * Pure: a capture and a URL in, a payload out. No network, no config, no clock.
 */

export type ReporterInfo = { name: string; email: string }

export type CapturePayload = {
  title: string
  /** One or two sentences: what this capture shows. */
  summary: string
  /** `1. (0:07) Clicked "Sign in"` — the app's own step labels, already summarised. */
  steps: string[]
  environment: string
  capturedAt: string
  durationLabel: string
  consoleErrors: string[]
  failedRequests: string[]
  shareUrl: string
  reporter: ReporterInfo
  counts: CaptureManifest['counts']
}

/**
 * What the desktop app sends alongside the capture, for the fields the manifest counts
 * but does not keep. The server stores counts, not console lines — so an integration
 * that wants the actual error text is given it at call time rather than the server
 * retaining a copy of somebody's stack traces.
 */
export type PayloadDetail = {
  steps?: string[]
  consoleErrors?: string[]
  failedRequests?: string[]
  summary?: string
}

const clip = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

const flat = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Caps, so a ticket stays readable and a Slack message stays inside its block limits. */
const LIMITS = { steps: 20, lines: 10, text: 300, summary: 600 } as const

const list = (values: readonly string[] | undefined, limit: number): string[] =>
  (values ?? [])
    .map((v) => clip(flat(v), LIMITS.text))
    .filter(Boolean)
    .slice(0, limit)

const durationLabel = (ms: number | null): string => {
  if (ms === null) return 'unknown'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The default summary, when the reporter did not write one.
 *
 * It leads with what failed rather than with what exists, which is the same judgement
 * the app's Analytics page makes: a count of captures is not information, and "two
 * requests failed" is.
 */
export function defaultSummary(manifest: CaptureManifest): string {
  const { consoleErrors, failedRequests, actions } = manifest.counts
  const found = [
    failedRequests > 0 ? `${failedRequests} failed request${failedRequests === 1 ? '' : 's'}` : '',
    consoleErrors > 0 ? `${consoleErrors} console error${consoleErrors === 1 ? '' : 's'}` : ''
  ].filter(Boolean)

  const where = actions > 0 ? ` across ${actions} recorded step${actions === 1 ? '' : 's'}` : ''
  return found.length > 0
    ? `snapit recorded ${found.join(' and ')}${where}.`
    : `A snapit capture${where}. Nothing failed outright — the recording is the evidence.`
}

export function capturePayload(
  capture: Capture,
  shareUrl: string,
  reporter: ReporterInfo,
  detail: PayloadDetail = {}
): CapturePayload {
  const manifest = capture.manifest
  return {
    title: clip(flat(capture.title), 200),
    summary: clip(flat(detail.summary ?? defaultSummary(manifest)), LIMITS.summary),
    steps: list(detail.steps, LIMITS.steps),
    environment: environmentLine(manifest),
    capturedAt: manifest.capturedAt,
    durationLabel: durationLabel(manifest.durationMs),
    consoleErrors: list(detail.consoleErrors, LIMITS.lines),
    failedRequests: list(detail.failedRequests, LIMITS.lines),
    shareUrl,
    reporter,
    counts: manifest.counts
  }
}
