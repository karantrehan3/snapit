import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { badRequest, notFound } from '../errors.ts'
import { isRole, permissionsFor, type Permission, type Role } from '../domain/rbac.ts'
import { userId as newUserId } from '../domain/ids.ts'
import { mine, shareUrlFor, type CaptureDeps } from './captures.ts'
import type { Capture, Membership } from '../domain/model.ts'
import type { MetadataStore } from '../store/metadata.ts'

/**
 * Workspace membership, and the one action that puts data outside it.
 *
 * Organization → Workspace → { Members, Captures, Integrations, Settings }, and
 * deliberately no deeper: a workspace owns captures and members, an org owns workspaces
 * and pays for the bucket. A hierarchy is the hardest thing to un-invent.
 */

export type WorkspaceDeps = { store: MetadataStore }

export type MemberView = { userId: string; role: Role; name: string; email: string }

export async function listMembers(
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string
): Promise<MemberView[]> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:read')
  const members = await deps.store.listMembers(workspaceId)
  return members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }))
}

export type SetMemberInput = { email?: unknown; role?: unknown; name?: unknown }

/**
 * Invite or re-role somebody.
 *
 * The check that matters is the last one: an admin cannot demote the last admin, because a
 * workspace with none has no way back and the store has no notion of an owner to fall
 * back to. Phase 3 adds `owner`, which is the real fix.
 */
export async function setMember(
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string,
  input: SetMemberInput
): Promise<Membership & { email: string; name: string; permissions: readonly Permission[] }> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:manage')

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!email.includes('@')) throw badRequest('`email` must be an email address.')
  if (!isRole(input.role)) throw badRequest('`role` must be admin, developer or viewer.')

  const user =
    (await deps.store.findUserByEmail(email)) ??
    (await deps.store.upsertUser({
      id: newUserId(),
      email,
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : email.split('@')[0]!
    }))

  if (user.id === actor.userId && input.role !== 'admin') {
    const admins = (await deps.store.listMembers(workspaceId)).filter((m) => m.role === 'admin')
    if (admins.length <= 1) throw badRequest('That would leave the workspace with no admin.')
  }

  const membership = await deps.store.setMembership({ workspaceId, userId: user.id, role: input.role })
  return { ...membership, email: user.email, name: user.name, permissions: permissionsFor(input.role) }
}

export async function removeMember(
  deps: WorkspaceDeps,
  actor: Actor,
  workspaceId: string,
  userId: string
): Promise<string> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'member:manage')
  if (userId === actor.userId) throw badRequest('Removing yourself would lock you out of this workspace.')
  await deps.store.removeMembership(workspaceId, userId)
  return userId
}

export type WhoAmI = {
  user: { id: string; name?: string; email?: string }
  workspace: { id: string; name: string; slug: string; orgId: string }
  role: Role
  permissions: readonly Permission[]
}

/** Who am I, and what may I do — the call a client makes on launch. */
export async function whoami(deps: WorkspaceDeps, actor: Actor): Promise<WhoAmI> {
  const [user, workspace] = await Promise.all([
    deps.store.getUser(actor.userId),
    deps.store.getWorkspace(actor.workspaceId)
  ])
  if (!workspace) throw notFound('That workspace no longer exists.')
  return {
    user: user ? { id: user.id, name: user.name, email: user.email } : { id: actor.userId },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, orgId: workspace.orgId },
    role: actor.claims.role,
    permissions: permissionsFor(actor.claims.role)
  }
}

/**
 * Mint or revoke the public link.
 *
 * Admin-only, because past this call the capture is reachable by anyone holding 26
 * characters and what it contains is a recording of an environment that usually mirrors
 * production. Revoking sets `linkRevokedAt` rather than deleting the slug, so a re-share
 * cannot reissue a URL that was already sent to the wrong channel.
 */
export async function setCaptureSharing(
  deps: CaptureDeps,
  actor: Actor,
  captureId: string,
  shared: unknown
): Promise<{ capture: Capture; shareUrl: string | null }> {
  requirePermission(actor, 'capture:share')
  const capture = await mine(deps, actor, captureId)

  if (typeof shared !== 'boolean') throw badRequest('`shared` must be true or false.')
  if (shared && capture.status !== 'ready') throw badRequest('That capture has not finished uploading.')
  if (shared && capture.linkRevokedAt !== null) {
    throw badRequest('This capture’s link was revoked. Re-upload the capture to share it again.')
  }

  const updated = await deps.store.updateCapture(capture.id, {
    visibility: shared ? 'link' : 'workspace',
    linkRevokedAt: shared ? null : new Date().toISOString()
  })
  return {
    capture: updated,
    shareUrl: updated.visibility === 'link' ? shareUrlFor(deps.publicUrl, updated) : null
  }
}
