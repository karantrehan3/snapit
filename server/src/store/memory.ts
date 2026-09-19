import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { NotFoundError, type MetadataStore } from './metadata.ts'
import type {
  Capture,
  Integration,
  IssueLink,
  Membership,
  Organization,
  User,
  Workspace
} from '../domain/model.ts'

/**
 * The prototype's store: maps in memory, snapshotted to one JSON file.
 *
 * It is a JSON file rather than SQLite or Postgres because the point of this prototype is
 * the *shape* — the storage seam, the upload protocol, the role check, the integration
 * boundary — and a database would add a migration story to an experiment that may be
 * thrown away. `MetadataStore` is what makes that reversible.
 *
 * Two things it does not do, named so nobody mistakes them for done:
 *
 * 1. **It is not concurrency-safe across processes.** The snapshot is written whole,
 *    atomically via rename, so a crash cannot corrupt it — but two servers on one file
 *    will lose writes. One process only.
 * 2. **Integration secrets do not belong in it.** They are held in memory here and are
 *    deliberately excluded from the snapshot, so the prototype cannot leave a Jira token
 *    sitting in a world-readable file. That means they are lost on restart, which is the
 *    correct inconvenience: a real build puts them in a secrets manager, and the
 *    inconvenience is the reminder.
 */

type Snapshot = {
  organizations: Organization[]
  workspaces: Workspace[]
  users: User[]
  memberships: Membership[]
  captures: Capture[]
  integrations: Integration[]
  issueLinks: IssueLink[]
}

const memberKey = (workspaceId: string, userId: string): string => `${workspaceId}\u0000${userId}`
const integrationKey = (workspaceId: string, kind: string): string => `${workspaceId}\u0000${kind}`

export type MemoryStore = MetadataStore & {
  /** Secrets live only here, never in the snapshot. See the note above. */
  setSecret(workspaceId: string, kind: Integration['kind'], secret: string): void
  getSecret(workspaceId: string, kind: Integration['kind']): string | null
  /** For tests and for `seed.ts`. */
  snapshot(): Snapshot
}

export async function createMemoryStore(file: string | null): Promise<MemoryStore> {
  const organizations = new Map<string, Organization>()
  const workspaces = new Map<string, Workspace>()
  const users = new Map<string, User>()
  const memberships = new Map<string, Membership>()
  const captures = new Map<string, Capture>()
  const capturesBySlug = new Map<string, string>()
  const integrations = new Map<string, Integration>()
  const issueLinks = new Map<string, IssueLink[]>()
  const secrets = new Map<string, string>()

  const snapshot = (): Snapshot => ({
    organizations: [...organizations.values()],
    workspaces: [...workspaces.values()],
    users: [...users.values()],
    memberships: [...memberships.values()],
    captures: [...captures.values()],
    integrations: [...integrations.values()],
    issueLinks: [...issueLinks.values()].flat()
  })

  const load = (data: Snapshot): void => {
    for (const o of data.organizations) organizations.set(o.id, o)
    for (const w of data.workspaces) workspaces.set(w.id, w)
    for (const u of data.users) users.set(u.id, u)
    for (const m of data.memberships) memberships.set(memberKey(m.workspaceId, m.userId), m)
    for (const c of data.captures) {
      captures.set(c.id, c)
      capturesBySlug.set(c.shareSlug, c.id)
    }
    for (const i of data.integrations) integrations.set(integrationKey(i.workspaceId, i.kind), i)
    for (const l of data.issueLinks) issueLinks.set(l.captureId, [...(issueLinks.get(l.captureId) ?? []), l])
  }

  if (file) {
    try {
      load(JSON.parse(await readFile(file, 'utf-8')) as Snapshot)
    } catch {
      // No snapshot yet is the first-run state, not an error — and a corrupt one should
      // not stop the server from starting, since it holds no bytes anybody cannot re-upload.
    }
  }

  /**
   * Written whole and renamed into place. A partial write of the metadata for a bucket
   * full of captures is the one failure here that is not recoverable by re-uploading.
   */
  let writing: Promise<void> = Promise.resolve()
  const persist = (): Promise<void> => {
    if (!file) return Promise.resolve()
    writing = writing.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const partial = `${file}.part`
      await writeFile(partial, JSON.stringify(snapshot(), null, 2), 'utf-8')
      await rename(partial, file)
    })
    return writing
  }

  const saved = async <T>(value: T): Promise<T> => {
    await persist()
    return value
  }

  return {
    snapshot,

    setSecret: (workspaceId, kind, secret) => void secrets.set(integrationKey(workspaceId, kind), secret),
    getSecret: (workspaceId, kind) => secrets.get(integrationKey(workspaceId, kind)) ?? null,

    createOrganization: (org) => saved((organizations.set(org.id, org), org)),
    getOrganization: async (id) => organizations.get(id) ?? null,

    createWorkspace: (workspace) => saved((workspaces.set(workspace.id, workspace), workspace)),
    getWorkspace: async (id) => workspaces.get(id) ?? null,
    listWorkspacesForUser: async (userId) =>
      [...memberships.values()]
        .filter((m) => m.userId === userId)
        .map((m) => workspaces.get(m.workspaceId))
        .filter((w): w is Workspace => w !== undefined),

    upsertUser: (user) => saved((users.set(user.id, user), user)),
    getUser: async (id) => users.get(id) ?? null,
    findUserByEmail: async (email) =>
      [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,

    setMembership: (membership) =>
      saved((memberships.set(memberKey(membership.workspaceId, membership.userId), membership), membership)),
    removeMembership: async (workspaceId, userId) => {
      memberships.delete(memberKey(workspaceId, userId))
      await persist()
    },
    getMembership: async (workspaceId, userId) => memberships.get(memberKey(workspaceId, userId)) ?? null,
    listMembers: async (workspaceId) =>
      [...memberships.values()]
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => ({ ...m, user: users.get(m.userId) }))
        .filter((m): m is Membership & { user: User } => m.user !== undefined),

    createCapture: (capture) =>
      saved((captures.set(capture.id, capture), capturesBySlug.set(capture.shareSlug, capture.id), capture)),
    getCapture: async (id) => captures.get(id) ?? null,
    findCaptureBySlug: async (slug) => {
      const id = capturesBySlug.get(slug)
      return id ? (captures.get(id) ?? null) : null
    },
    listCaptures: async (workspaceId, options) =>
      [...captures.values()]
        .filter((c) => c.workspaceId === workspaceId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, options?.limit ?? 50),
    updateCapture: async (id, patch) => {
      const existing = captures.get(id)
      if (!existing) throw new NotFoundError(`Capture ${id}`)
      // A new object, never a mutation of the stored one: a handler holding the previous
      // value must not see it change under it.
      const next: Capture = { ...existing, ...patch }
      captures.set(id, next)
      await persist()
      return next
    },
    deleteCapture: async (id) => {
      const existing = captures.get(id)
      if (existing) capturesBySlug.delete(existing.shareSlug)
      captures.delete(id)
      issueLinks.delete(id)
      await persist()
    },

    setIntegration: (integration) =>
      saved(
        (integrations.set(integrationKey(integration.workspaceId, integration.kind), integration),
        integration)
      ),
    getIntegration: async (workspaceId, kind) => integrations.get(integrationKey(workspaceId, kind)) ?? null,
    listIntegrations: async (workspaceId) =>
      [...integrations.values()].filter((i) => i.workspaceId === workspaceId),

    addIssueLink: (link) =>
      saved((issueLinks.set(link.captureId, [...(issueLinks.get(link.captureId) ?? []), link]), link)),
    listIssueLinks: async (captureId) => issueLinks.get(captureId) ?? []
  }
}
