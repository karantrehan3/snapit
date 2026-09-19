import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readJson } from '../http/router.ts'
import { HttpError, badRequest, notFound, sendOk } from '../http/respond.ts'
import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { capturePayload, type PayloadDetail } from '../integrations/payload.ts'
import { jiraTarget } from '../integrations/jira.ts'
import { slackTarget } from '../integrations/slack.ts'
import { IntegrationError, type IssueRef } from '../integrations/target.ts'
import { mine, shareUrlFor, type CaptureDeps } from './captures.ts'
import type { IntegrationKind } from '../domain/model.ts'
import type { MemoryStore } from '../store/memory.ts'

/**
 * Filing a capture somewhere else.
 *
 * Two routes per target, and the split is the point:
 *
 * - `POST …/preview` is pure and sends nothing. It returns the exact document that would
 *   be filed, so the desktop app can show it before anyone commits. An integration whose
 *   output can only be seen by using it is one people file once and then stop trusting.
 * - `POST …/file` does it, and records an `IssueLink` so a capture knows where it went.
 *
 * `integration:use` and `integration:manage` are separate permissions: a developer files
 * bugs, an admin decides which Jira site the workspace is wired to. Wiring is the one
 * that carries a credential.
 */

export type IntegrationDeps = CaptureDeps & { store: MemoryStore }

const KINDS: readonly IntegrationKind[] = ['jira', 'slack']

const kindFrom = (value: string): IntegrationKind => {
  if (!KINDS.includes(value as IntegrationKind)) throw notFound(`No integration named ${value}.`)
  return value as IntegrationKind
}

/** Configure a target. The secret is held in memory and never written — see `store/memory.ts`. */
export async function setIntegration(
  req: IncomingMessage,
  res: ServerResponse,
  deps: IntegrationDeps,
  actor: Actor,
  workspaceId: string,
  kindRaw: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'integration:manage')
  const kind = kindFrom(kindRaw)

  const body = (await readJson(req)) as Record<string, unknown>
  const settings: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.settings ?? {})) {
    if (typeof value === 'string') settings[key] = value.slice(0, 500)
  }
  if (typeof body.secret !== 'string' || !body.secret) {
    throw badRequest('`secret` is required — a Jira API token, or a Slack webhook URL.')
  }

  const integration = await deps.store.setIntegration({
    id: randomUUID(),
    workspaceId,
    kind,
    settings,
    createdAt: new Date().toISOString()
  })
  deps.store.setSecret(workspaceId, kind, body.secret)

  // The secret never comes back out, not even to the admin who set it.
  sendOk(res, { integration, secretStored: true })
}

export async function listIntegrations(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: IntegrationDeps,
  actor: Actor,
  workspaceId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'integration:use')
  const integrations = await deps.store.listIntegrations(workspaceId)
  sendOk(
    res,
    integrations.map((i) => ({
      kind: i.kind,
      settings: i.settings,
      configured: deps.store.getSecret(workspaceId, i.kind) !== null
    }))
  )
}

/** The detail the server does not retain: steps, console lines, failing requests. */
function detailFrom(body: Record<string, unknown>): PayloadDetail {
  const strings = (raw: unknown): string[] | undefined =>
    Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : undefined
  return {
    steps: strings(body.steps),
    consoleErrors: strings(body.consoleErrors),
    failedRequests: strings(body.failedRequests),
    summary: typeof body.summary === 'string' ? body.summary : undefined
  }
}

async function payloadFor(
  req: IncomingMessage,
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string
): Promise<{ payload: ReturnType<typeof capturePayload>; body: Record<string, unknown> }> {
  const capture = await mine(deps, actor, captureId)
  const body = (await readJson(req, 2_000_000)) as Record<string, unknown>
  const user = await deps.store.getUser(actor.userId)
  const payload = capturePayload(
    capture,
    shareUrlFor(deps.publicUrl, capture),
    { name: user?.name ?? 'A snapit user', email: user?.email ?? '' },
    detailFrom(body)
  )
  return { payload, body }
}

/** What would be sent, without sending it. */
export async function previewIntegration(
  req: IncomingMessage,
  res: ServerResponse,
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string,
  kindRaw: string
): Promise<void> {
  requirePermission(actor, 'integration:use')
  const kind = kindFrom(kindRaw)
  const { payload } = await payloadFor(req, deps, actor, captureId)
  const integration = await deps.store.getIntegration(actor.workspaceId, kind)
  const settings = integration?.settings ?? {}

  sendOk(res, {
    kind,
    payload,
    document: kind === 'jira' ? jiraTarget.preview(payload, settings) : slackTarget.preview(payload, settings)
  })
}

/**
 * File it.
 *
 * Jira first, then Slack with the issue key attached, because the Slack message is
 * better for carrying it and because a Slack post that succeeds after a Jira failure
 * announces a bug nobody filed. A Slack failure after a successful Jira create is
 * reported but does not fail the request — the issue exists, and telling the caller
 * otherwise would have them file it twice.
 */
export async function fileIntegration(
  req: IncomingMessage,
  res: ServerResponse,
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string
): Promise<void> {
  requirePermission(actor, 'integration:use')
  const capture = await mine(deps, actor, captureId)
  const { payload, body } = await payloadFor(req, deps, actor, captureId)

  const wants = (kind: IntegrationKind): boolean => body[kind] === true
  if (!wants('jira') && !wants('slack')) throw badRequest('Set `jira: true`, `slack: true`, or both.')

  const run = async <T>(
    kind: IntegrationKind,
    go: (settings: Record<string, string>, secret: string) => Promise<T>
  ): Promise<T> => {
    const integration = await deps.store.getIntegration(actor.workspaceId, kind)
    const secret = deps.store.getSecret(actor.workspaceId, kind)
    if (!integration || !secret) {
      throw new HttpError(
        409,
        'integration_not_configured',
        `This workspace has no ${kind} connection. An admin sets it up.`
      )
    }
    try {
      return await go(integration.settings, secret)
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw new HttpError(err.retryable ? 503 : 422, `${kind}_rejected`, err.message)
      }
      throw err
    }
  }

  let issue: IssueRef | undefined
  if (wants('jira')) {
    issue = await run('jira', (settings, secret) => jiraTarget.create(payload, settings, secret))
    await deps.store.addIssueLink({
      captureId: capture.id,
      kind: 'jira',
      externalId: issue.key,
      url: issue.url,
      createdAt: new Date().toISOString()
    })
  }

  let slackError: string | null = null
  if (wants('slack')) {
    try {
      const posted = await run('slack', (settings, secret) =>
        slackTarget.post(payload, settings, secret, issue)
      )
      await deps.store.addIssueLink({
        captureId: capture.id,
        kind: 'slack',
        externalId: posted.id,
        url: posted.url ?? '',
        createdAt: new Date().toISOString()
      })
    } catch (err) {
      // The Jira issue is already filed. Failing the whole request here would have the
      // caller retry and file it twice.
      if (!issue) throw err
      slackError = err instanceof HttpError ? err.message : 'Slack could not be reached.'
    }
  }

  sendOk(res, { issue: issue ?? null, slackError })
}
