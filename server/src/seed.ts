import {
  orgId as newOrgId,
  userId as newUserId,
  workspaceId as newWorkspaceId
} from '@snapit/core/domain/ids'
import { issueToken } from '@snapit/core/auth/tokens'
import type { MemoryStore } from '@snapit/core/store/memory'
import type { Role } from '@snapit/core/domain/rbac'

/**
 * A workspace to talk to, on first run.
 *
 * Only runs when the store is empty. It exists because the alternative for anyone trying
 * this is a signup flow that is not the point of the prototype — and because printing
 * three tokens, one per role, is the fastest way to check that the role table in
 * `rbac.ts` actually gates anything.
 */

const SEED_USERS: ReadonlyArray<{ email: string; name: string; role: Role }> = [
  { email: 'admin@example.com', name: 'An admin', role: 'admin' },
  { email: 'dev@example.com', name: 'A developer', role: 'developer' },
  { email: 'viewer@example.com', name: 'A viewer', role: 'viewer' }
]

/** A day. Long enough to try things, short enough to be a bad thing to leave lying around. */
const SEED_TOKEN_SECONDS = 86_400

export type Seeded = { workspaceId: string; tokens: Record<Role, string> }

export async function seedIfEmpty(store: MemoryStore, secret: string): Promise<Seeded | null> {
  if (store.snapshot().workspaces.length > 0) return null

  const org = await store.createOrganization({
    id: newOrgId(),
    name: 'Example Org',
    createdAt: new Date().toISOString()
  })
  const workspace = await store.createWorkspace({
    id: newWorkspaceId(),
    orgId: org.id,
    name: 'Web QA',
    slug: 'web-qa',
    createdAt: new Date().toISOString()
  })

  const exp = Math.floor(Date.now() / 1000) + SEED_TOKEN_SECONDS
  const tokens = {} as Record<Role, string>
  for (const seed of SEED_USERS) {
    const user = await store.upsertUser({ id: newUserId(), email: seed.email, name: seed.name })
    await store.setMembership({ workspaceId: workspace.id, userId: user.id, role: seed.role })
    tokens[seed.role] = issueToken(secret, {
      sub: user.id,
      ws: workspace.id,
      org: org.id,
      role: seed.role,
      exp
    })
  }
  return { workspaceId: workspace.id, tokens }
}
