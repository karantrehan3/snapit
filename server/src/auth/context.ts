import type { IncomingMessage } from 'node:http'
import { forbidden, unauthorized } from '../http/respond.ts'
import { can, type Permission } from '../domain/rbac.ts'
import { extractBearerToken, verifyToken, type TokenClaims } from './tokens.ts'

/**
 * Who is asking, and what they may do.
 *
 * The one rule this file exists to enforce: **the workspace comes from the token, never
 * from the path.** A handler that reads `:workspaceId` and trusts it has an IDOR; a
 * handler that calls `requireWorkspace(actor, params.workspaceId)` cannot. So the path
 * parameter is only ever used to *check agreement*, and disagreement is a 403 rather
 * than a silent redirect to the token's own workspace — a client asking for someone
 * else's workspace has a bug or worse, and quietly answering a different question hides
 * both.
 */

export type Actor = {
  userId: string
  workspaceId: string
  orgId: string
  claims: TokenClaims
}

export function actorFrom(req: IncomingMessage, secret: string, nowSeconds: number): Actor {
  const token = extractBearerToken(req.headers.authorization)
  if (!token) throw unauthorized('Missing Authorization: Bearer <token>.')
  const result = verifyToken(secret, token, nowSeconds)
  if (!result.ok) throw unauthorized(result.why)
  return {
    userId: result.claims.sub,
    workspaceId: result.claims.ws,
    orgId: result.claims.org,
    claims: result.claims
  }
}

/**
 * The message names the permission rather than describing it.
 *
 * "A developer may not share captures" reads better and tells an operator less: when
 * somebody reports being blocked, `capture:share` is the string they can find in
 * `rbac.ts`, and the table there is the answer to why.
 */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor.claims.role, permission)) {
    throw forbidden(`This action needs "${permission}", which the ${actor.claims.role} role does not have.`)
  }
}

/** Assert the path's workspace is the token's workspace. */
export function requireWorkspace(actor: Actor, workspaceId: string): void {
  if (actor.workspaceId !== workspaceId) {
    throw forbidden('This token is not scoped to that workspace.')
  }
}
