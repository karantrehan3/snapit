import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../router.ts'
import { sendOk } from '../respond.ts'
import type { Actor } from '../../auth/context.ts'
import * as captures from '../../services/captures.ts'
import * as workspaces from '../../services/workspaces.ts'
import * as integrations from '../../services/integrations.ts'
import type { PayloadDetail } from '../../integrations/payload.ts'

/**
 * HTTP over the services, and nothing else.
 *
 * Every function here reads a body, calls one service function and writes the envelope.
 * There is no logic and no authorisation — those live in `src/services/`, so the desktop
 * app calling in-process gets exactly the same rules as a request arriving over the wire.
 * If a check ever appears in this file, it is a check the in-process caller skips.
 */

export type ApiDeps = integrations.IntegrationDeps

const body = async (req: IncomingMessage, max?: number): Promise<Record<string, unknown>> =>
  ((await readJson(req, max)) ?? {}) as Record<string, unknown>

/** Only the fields the payload builder understands, so an odd body cannot reach an adapter. */
function detailFrom(raw: Record<string, unknown>): PayloadDetail {
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined
  return {
    steps: strings(raw.steps),
    consoleErrors: strings(raw.consoleErrors),
    failedRequests: strings(raw.failedRequests),
    summary: typeof raw.summary === 'string' ? raw.summary : undefined
  }
}

export const routes = {
  whoami: async (_req: IncomingMessage, res: ServerResponse, deps: ApiDeps, actor: Actor) =>
    sendOk(res, await workspaces.whoami(deps, actor)),

  listMembers: async (_req: IncomingMessage, res: ServerResponse, deps: ApiDeps, actor: Actor, ws: string) =>
    sendOk(res, await workspaces.listMembers(deps, actor, ws)),

  setMember: async (req: IncomingMessage, res: ServerResponse, deps: ApiDeps, actor: Actor, ws: string) =>
    sendOk(res, await workspaces.setMember(deps, actor, ws, await body(req))),

  removeMember: async (
    _req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    ws: string,
    userId: string
  ) => sendOk(res, { removed: await workspaces.removeMember(deps, actor, ws, userId) }),

  createCapture: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    ws: string
  ) => {
    const input = await body(req)
    sendOk(res, await captures.createCapture(deps, actor, ws, { title: input.title, files: input.files }))
  },

  listCaptures: async (
    _req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    ws: string
  ) => {
    const list = await captures.listCaptures(deps, actor, ws)
    sendOk(res, { captures: list }, { count: list.length })
  },

  completeCapture: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    id: string
  ) => {
    // Larger cap: `meta` carries the capture's own metadata document.
    const input = await body(req, 4_000_000)
    sendOk(res, await captures.completeCapture(deps, actor, id, { files: input.files, meta: input.meta }))
  },

  getCapture: async (_req: IncomingMessage, res: ServerResponse, deps: ApiDeps, actor: Actor, id: string) =>
    sendOk(res, await captures.getCapture(deps, actor, id)),

  deleteCapture: async (
    _req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    id: string
  ) => sendOk(res, { deleted: await captures.deleteCapture(deps, actor, id) }),

  setCaptureSharing: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    id: string
  ) => sendOk(res, await workspaces.setCaptureSharing(deps, actor, id, (await body(req)).shared)),

  listIntegrations: async (
    _req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    ws: string
  ) => sendOk(res, await integrations.listIntegrations(deps, actor, ws)),

  setIntegration: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    ws: string,
    kind: string
  ) => {
    const input = await body(req)
    const integration = await integrations.setIntegration(deps, actor, ws, kind, input)
    // The secret never comes back out, not even to the admin who set it.
    sendOk(res, { integration, secretStored: true })
  },

  previewIntegration: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    id: string,
    kind: string
  ) =>
    sendOk(
      res,
      await integrations.previewIntegration(deps, actor, id, kind, detailFrom(await body(req, 2_000_000)))
    ),

  fileIntegration: async (
    req: IncomingMessage,
    res: ServerResponse,
    deps: ApiDeps,
    actor: Actor,
    id: string
  ) => {
    const raw = await body(req, 2_000_000)
    sendOk(
      res,
      await integrations.fileIntegration(deps, actor, id, {
        ...detailFrom(raw),
        jira: raw.jira,
        slack: raw.slack
      })
    )
  }
}
