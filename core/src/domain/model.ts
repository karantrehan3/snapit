import type { Role } from './rbac.ts'
import type { CaptureManifest } from './manifest.ts'

/**
 * The records the server owns.
 *
 * What it owns is the striking part of the list: identity, membership, and *where the
 * bytes are*. It does not own the bytes. That split is the whole product argument —
 * snapit's server holds the metadata a team needs to find and govern a capture, and the
 * customer's bucket holds the recording of their own QA environment.
 */

export type Organization = {
  id: string
  name: string
  createdAt: string
}

export type Workspace = {
  id: string
  orgId: string
  name: string
  /** Human-facing, unique within the org. Appears in no URL — share links use slugs. */
  slug: string
  createdAt: string
}

export type User = {
  id: string
  email: string
  name: string
}

export type Membership = {
  userId: string
  workspaceId: string
  role: Role
}

/**
 * How a capture may be reached.
 *
 * `workspace` is the default and the safe one. `link` is the shareable URL in the brief,
 * and it is a deliberate hole in the role check — so it is a per-capture field an admin
 * sets, never a workspace default, and `revokedAt` exists because the only honest answer
 * to "can I un-share it" is one the server can give.
 */
export type CaptureVisibility = 'workspace' | 'link'

/**
 * `pending` from the moment the upload URLs are minted; `ready` once the desktop says it
 * finished and the server has confirmed the objects are there. Nothing reads a `pending`
 * capture, which is what stops a viewer rendering half an upload.
 */
export type CaptureStatus = 'pending' | 'ready' | 'failed'

export type Capture = {
  id: string
  workspaceId: string
  orgId: string
  /** Unguessable, 128 bits. See `ids.ts`. */
  shareSlug: string
  title: string
  status: CaptureStatus
  visibility: CaptureVisibility
  /** ISO. Set when a link is revoked; a revoked link 404s rather than 403s. */
  linkRevokedAt: string | null
  uploadedBy: string
  createdAt: string
  manifest: CaptureManifest
}

export type IntegrationKind = 'jira' | 'slack'

/**
 * An integration's configuration, per workspace.
 *
 * `secret` is stored here in the prototype and should not be in anything real — see the
 * note in `store/memory.ts`. ROADMAP M1.7 names "a stored credential" as its first cost
 * and it is right: this record is the first thing worth stealing in the whole system.
 */
export type Integration = {
  id: string
  workspaceId: string
  kind: IntegrationKind
  /** Non-secret settings: a Jira site and project key, a Slack channel. */
  settings: Record<string, string>
  createdAt: string
}

export type IssueLink = {
  captureId: string
  kind: IntegrationKind
  /** `DEV-7641`, or a Slack message ts. */
  externalId: string
  url: string
  createdAt: string
}
