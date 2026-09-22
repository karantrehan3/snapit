import { randomUUID } from 'node:crypto'
import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { HttpError, badRequest, notFound } from '../http/respond.ts'
import { capturePayload, type CapturePayload, type PayloadDetail } from '../integrations/payload.ts'
import { jiraTarget } from '../integrations/jira.ts'
import { slackTarget } from '../integrations/slack.ts'
import { IntegrationError, type IssueRef } from '../integrations/target.ts'
import { mine, shareUrlFor, type CaptureDeps } from './captures.ts'
import type { Integration, IntegrationKind } from '../domain/model.ts'
import type { SecretStore } from '../store/metadata.ts'

/**
 * Filing a capture somewhere else.
 *
 * `preview` is pure and sends nothing; `file` does it. That split is the point: an
 * integration whose output can only be seen by using it is one people file once and then
 * stop trusting, and the desktop app can show the reporter exactly what is about to be
 * created.
 *
 * `integration:use` and `integration:manage` are separate permissions. A developer files
 * bugs; an admin decides which Jira site the workspace is wired to. Wiring is the one that
 * carries a credential.
 */

export type IntegrationDeps = CaptureDeps & { secrets: SecretStore }

const KINDS: readonly IntegrationKind[] = ['jira', 'slack']

export const parseKind = (value: string): IntegrationKind => {
  if (!KINDS.includes(value as IntegrationKind)) throw notFound(`No integration named ${value}.`)
  return value as IntegrationKind
}

export type SetIntegrationInput = { settings?: unknown; secret?: unknown }

export async function setIntegration(
  deps: IntegrationDeps,
  actor: Actor,
  workspaceId: string,
  kindRaw: string,
  input: SetIntegrationInput
): Promise<Integration> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'integration:manage')
  const kind = parseKind(kindRaw)

  const settings: Record<string, string> = {}
  for (const [key, value] of Object.entries((input.settings ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'string') settings[key] = value.slice(0, 500)
  }
  if (typeof input.secret !== 'string' || !input.secret) {
    throw badRequest('`secret` is required — a Jira API token, or a Slack webhook URL.')
  }

  const integration = await deps.store.setIntegration({
    id: randomUUID(),
    workspaceId,
    kind,
    settings,
    createdAt: new Date().toISOString()
  })
  deps.secrets.setSecret(workspaceId, kind, input.secret)
  return integration
}

export type IntegrationView = { kind: IntegrationKind; settings: Record<string, string>; configured: boolean }

export async function listIntegrations(
  deps: IntegrationDeps,
  actor: Actor,
  workspaceId: string
): Promise<IntegrationView[]> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'integration:use')
  const integrations = await deps.store.listIntegrations(workspaceId)
  return integrations.map((i) => ({
    kind: i.kind,
    settings: i.settings,
    configured: deps.secrets.getSecret(workspaceId, i.kind) !== null
  }))
}

/**
 * The detail the server deliberately does not retain.
 *
 * Counts are stored; console lines and response bodies are not. They are supplied at call
 * time so filing a ticket does not require the server to keep a copy of somebody's stack
 * traces.
 */
export type FileInput = PayloadDetail & { jira?: unknown; slack?: unknown }

async function payloadFor(
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string,
  detail: PayloadDetail
): Promise<CapturePayload> {
  const capture = await mine(deps, actor, captureId)
  const user = await deps.store.getUser(actor.userId)
  return capturePayload(
    capture,
    shareUrlFor(deps.publicUrl, capture),
    { name: user?.name ?? 'A snapit user', email: user?.email ?? '' },
    detail
  )
}

export async function previewIntegration(
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string,
  kindRaw: string,
  detail: PayloadDetail
): Promise<{ kind: IntegrationKind; payload: CapturePayload; document: unknown }> {
  requirePermission(actor, 'integration:use')
  const kind = parseKind(kindRaw)
  const payload = await payloadFor(deps, actor, captureId, detail)
  const settings = (await deps.store.getIntegration(actor.workspaceId, kind))?.settings ?? {}
  return {
    kind,
    payload,
    document: kind === 'jira' ? jiraTarget.preview(payload, settings) : slackTarget.preview(payload, settings)
  }
}

/**
 * File it.
 *
 * Jira first, then Slack with the issue key attached — because the Slack message is better
 * for carrying it, and because a Slack post that succeeds after a Jira failure announces a
 * bug nobody filed. A Slack failure *after* a successful Jira create is reported but does
 * not fail the call: the issue exists, and saying otherwise has the caller file it twice.
 */
export async function fileIntegration(
  deps: IntegrationDeps,
  actor: Actor,
  captureId: string,
  input: FileInput
): Promise<{ issue: IssueRef | null; slackError: string | null }> {
  requirePermission(actor, 'integration:use')
  const capture = await mine(deps, actor, captureId)
  const payload = await payloadFor(deps, actor, captureId, input)

  const wants = (kind: IntegrationKind): boolean => input[kind] === true
  if (!wants('jira') && !wants('slack')) throw badRequest('Set `jira: true`, `slack: true`, or both.')

  const run = async <T>(
    kind: IntegrationKind,
    go: (settings: Record<string, string>, secret: string) => Promise<T>
  ): Promise<T> => {
    const integration = await deps.store.getIntegration(actor.workspaceId, kind)
    const secret = deps.secrets.getSecret(actor.workspaceId, kind)
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
      if (!issue) throw err
      slackError = err instanceof HttpError ? err.message : 'Slack could not be reached.'
    }
  }

  return { issue: issue ?? null, slackError }
}
