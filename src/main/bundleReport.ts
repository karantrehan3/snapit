import { basename } from 'path'
import { BUNDLE_FILES, type CaptureMeta } from './bundle'
import { actionLabel, type ActionRecord } from './collector/actions'
import type { ConsoleEntry } from './collector/session'
import { readBundleJson } from './mcp/bundles'
import { renderReport, type ReportAction, type ReportConsoleLine, type ReportData } from './report'
import { reportRequests } from './reportRequests'

/**
 * Turning a bundle folder back into the inputs `renderReport` takes.
 *
 * This exists because there are now three readers of a bundle — the single-file export,
 * the home window, and the bundle's own `report.html` at capture time — and the first
 * two both start by reading the same four files and converting the same three clocks.
 * Having that in one place is what makes rendering on open safe to do: whatever the
 * home window shows is what a share would produce, because neither of them has its own
 * idea of what a bundle contains.
 *
 * `captureSession.ts` is the third reader and does not come through here: it still has
 * the collected session in memory and has no folder to read.
 */

export type BundleReport = { meta: CaptureMeta; data: ReportData }

/**
 * Read a bundle's report inputs. Throws only when there is no readable metadata, since
 * without it there is no capture to describe — every other file is legitimately absent
 * from some kind of capture.
 */
export async function readBundleReport(dir: string): Promise<BundleReport> {
  const meta = await readBundleJson<CaptureMeta>(dir, BUNDLE_FILES.meta)
  if (!meta?.capture) throw new Error(`${basename(dir)} has no readable metadata.`)

  const consoleEntries = (await readBundleJson<ConsoleEntry[]>(dir, BUNDLE_FILES.console)) ?? []
  const har = await readBundleJson<unknown>(dir, BUNDLE_FILES.har)
  const actionFile = await readBundleJson<{ actions?: ActionRecord[] }>(dir, BUNDLE_FILES.actions)

  const lines: ReportConsoleLine[] = consoleEntries.map((c) => ({
    atMs: c.atMs,
    level: c.level,
    text: c.text
  }))
  const actions: ReportAction[] = (actionFile?.actions ?? []).map((a) => ({
    atMs: a.atMs,
    label: actionLabel(a)
  }))
  // The HAR's timestamps are absolute; everything else counts from the capture's origin.
  const requests = har ? reportRequests(har, Date.parse(meta.capturedAt)) : []

  return { meta, data: { console: lines, actions, requests } }
}

/**
 * The report for a bundle, rendered now.
 *
 * No options at all, which is the whole reason the home window frames this rather than
 * rebuilding it in React: the media element's `src` defaults to the media's bare
 * filename, and the frame's document sits at `snapit-capture://<id>/report.html`, so
 * that bare filename resolves to the media through the same grant. The page the home
 * window shows is byte-for-byte the page a bundle carries.
 */
export async function renderBundleReport(dir: string): Promise<string> {
  const { meta, data } = await readBundleReport(dir)
  return renderReport(meta, data)
}
