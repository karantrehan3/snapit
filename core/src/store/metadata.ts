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
 * The metadata the server owns, behind an interface.
 *
 * The interface exists for the reason the repository pattern usually does not justify
 * itself: the prototype's implementation is a JSON file, and the real one is Postgres,
 * and the API layer must not be rewritten between them. Everything here is expressible
 * in both — no cursors, no transactions spanning calls, no partial updates that assume
 * read-modify-write is atomic.
 *
 * The one call that would be wrong to add is a general `query`. Every read here is
 * scoped by workspace on purpose: a store method that can return captures across
 * workspaces is a store method an API handler can forget to constrain.
 */
export interface MetadataStore {
  createOrganization(org: Organization): Promise<Organization>
  getOrganization(id: string): Promise<Organization | null>

  createWorkspace(workspace: Workspace): Promise<Workspace>
  getWorkspace(id: string): Promise<Workspace | null>
  listWorkspacesForUser(userId: string): Promise<Workspace[]>

  upsertUser(user: User): Promise<User>
  getUser(id: string): Promise<User | null>
  findUserByEmail(email: string): Promise<User | null>

  setMembership(membership: Membership): Promise<Membership>
  removeMembership(workspaceId: string, userId: string): Promise<void>
  getMembership(workspaceId: string, userId: string): Promise<Membership | null>
  listMembers(workspaceId: string): Promise<Array<Membership & { user: User }>>

  createCapture(capture: Capture): Promise<Capture>
  getCapture(id: string): Promise<Capture | null>
  /** The only lookup that is not workspace-scoped, because a share link has no session. */
  findCaptureBySlug(slug: string): Promise<Capture | null>
  listCaptures(workspaceId: string, options?: { limit?: number }): Promise<Capture[]>
  updateCapture(
    id: string,
    patch: Partial<Pick<Capture, 'status' | 'visibility' | 'linkRevokedAt' | 'title' | 'manifest'>>
  ): Promise<Capture>
  deleteCapture(id: string): Promise<void>

  setIntegration(integration: Integration): Promise<Integration>
  getIntegration(workspaceId: string, kind: Integration['kind']): Promise<Integration | null>
  listIntegrations(workspaceId: string): Promise<Integration[]>

  addIssueLink(link: IssueLink): Promise<IssueLink>
  listIssueLinks(captureId: string): Promise<IssueLink[]>
}

/**
 * Where integration credentials live.
 *
 * Separated from `MetadataStore` because it is the one thing that must *not* be persisted
 * the way everything else is — see `store/memory.ts`. Keeping it a distinct contract means
 * a real build can put it in a secrets manager without touching the metadata store.
 */
export interface SecretStore {
  setSecret(workspaceId: string, kind: string, secret: string): void
  getSecret(workspaceId: string, kind: string): string | null
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found.`)
    this.name = 'NotFoundError'
  }
}
