import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/router.ts'
import { badRequest, notFound, sendOk } from '../http/respond.ts'
import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { isRole, permissionsFor } from '../domain/rbac.ts'
import { userId as newUserId } from '../domain/ids.ts'
import { mine, shareUrlFor, type CaptureDeps } from './captures.ts'
import type { MetadataStore } from '../store/metadata.ts'

/**
 * Workspace membership, and the one action that puts data outside it.
 *
 * Organization → Workspace → { Members, Captures, Integrations, Settings } is the model
 * from the brief, and the shape is deliberately shallow: a workspace owns captures and
 * members, and an org owns workspaces and pays for the bucket. Nothing is nested deeper
 * because nothing in the product needs it yet, and a hierarchy is the hardest thing to
 * un-invent.
 */

export type WorkspaceDeps = { store: MetadataStore }

export async function listMembers(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:read')
  const members = await deps.store.listMembers(workspaceId)
  sendOk(
    res,
    members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }))
  )
}

/**
 * Invite or re-role somebody.
 *
 * Invites by email and creates the user if they are unknown, which is the prototype's
 * stand-in for an invitation flow. The check that matters is the last one: an admin
 * cannot demote themselves, because a workspace with no admin has no way back and the
 * store has no notion of an owner to fall back to.
 */
export async function setMember(
  req: IncomingMessage,
  res: ServerResponse,
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:manage')

  const body = (await readJson(req)) as Record<string, unknown>
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email.includes('@')) throw badRequest('`email` must be an email address.')
  if (!isRole(body.role)) throw badRequest('`role` must be admin, developer or viewer.')

  const user =
    (await deps.store.findUserByEmail(email)) ??
    (await deps.store.upsertUser({
      id: newUserId(),
      email,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email.split('@')[0]!
    }))

  if (user.id === actor.userId && body.role !== 'admin') {
    const admins = (await deps.store.listMembers(workspaceId)).filter((m) => m.role === 'admin')
    if (admins.length <= 1) throw badRequest('That would leave the workspace with no admin.')
  }

  const membership = await deps.store.setMembership({ workspaceId, userId: user.id, role: body.role })
  sendOk(res, { ...membership, email: user.email, name: user.name, permissions: permissionsFor(body.role) })
}

export async function removeMember(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string,
  userId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:manage')
  if (userId === actor.userId) throw badRequest('Removing yourself would lock you out of this workspace.')
  await deps.store.removeMembership(workspaceId, userId)
  sendOk(res, { removed: userId })
}

/** Who am I, and what may I do — the call a client makes on launch. */
export async function whoami(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: WorkspaceDeps,
  actor: Actor
): Promise<void> {
  const [user, workspace] = await Promise.all([
    deps.store.getUser(actor.userId),
    deps.store.getWorkspace(actor.workspaceId)
  ])
  if (!workspace) throw notFound('That workspace no longer exists.')
  sendOk(res, {
    user: user ? { id: user.id, name: user.name, email: user.email } : { id: actor.userId },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, orgId: workspace.orgId },
    role: actor.claims.role,
    permissions: permissionsFor(actor.claims.role)
  })
}

/**
 * Mint or revoke the public link.
 *
 * `capture:share` is an admin-only permission and this is why: past this call the
 * capture is reachable by anyone holding 26 characters, and what it contains is a
 * recording of a QA environment that usually mirrors production. Revoking sets
 * `linkRevokedAt` rather than deleting the slug, so a re-share cannot reissue a URL that
 * was already sent to the wrong channel.
 */
export async function setCaptureSharing(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  captureId: string
): Promise<void> {
  requirePermission(actor, 'capture:share')
  const capture = await mine(deps, actor, captureId)

  const body = (await readJson(req)) as Record<string, unknown>
  if (typeof body.shared !== 'boolean') throw badRequest('`shared` must be true or false.')
  if (body.shared && capture.status !== 'ready') throw badRequest('That capture has not finished uploading.')
  if (body.shared && capture.linkRevokedAt !== null) {
    throw badRequest('This capture’s link was revoked. Re-upload the capture to share it again.')
  }

  const updated = await deps.store.updateCapture(capture.id, {
    visibility: body.shared ? 'link' : 'workspace',
    linkRevokedAt: body.shared ? null : new Date().toISOString()
  })
  sendOk(res, {
    capture: updated,
    shareUrl: updated.visibility === 'link' ? shareUrlFor(deps.publicUrl, updated) : null
  })
}
