import { StorageError, type StorageKey } from './provider.ts'

/**
 * Where a capture's objects live in the bucket.
 *
 * The layout is chosen so that every deletion snapit needs is a prefix deletion:
 * a capture, a workspace, an organisation. Retention is the cost M1.7 names third —
 * "the retention problem moves, it does not go away" — and the only version of it that
 * a customer can actually operate is one where their own lifecycle rule can match a
 * prefix. So the prefix comes first and the filename comes last, always.
 *
 * `role` separates the three kinds of file because they have three different exposure
 * profiles: the report is served to a browser, the media is streamed to a player, and
 * the data files are downloads. A bucket policy can tell them apart here and nowhere
 * else.
 *
 * Pure, and the half worth testing: every name in it arrived over HTTP.
 */

export type ArtifactRole = 'report' | 'media' | 'data'

const ROLE_DIR: Record<ArtifactRole, string> = {
  report: 'report',
  media: 'media',
  data: 'data'
}

/** Slug-ish identifiers only. Ids are minted by `domain/ids.ts`; this re-checks them. */
const ID = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * A single path segment, with no way out of it.
 *
 * `..` is the obvious one. The less obvious ones are a backslash (a separator on the
 * provider's filesystem even when it is not one here), a leading dot (hides the file
 * from the folder listing a support engineer is reading), and a NUL (truncates the path
 * in anything that reaches C).
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function requireId(kind: string, value: string): string {
  if (!ID.test(value)) throw new StorageError('failed', `Not a usable ${kind} id: ${JSON.stringify(value)}`)
  return value
}

export function requireFilename(value: string): string {
  if (!SEGMENT.test(value) || value.includes('..')) {
    throw new StorageError('failed', `Not a usable filename: ${JSON.stringify(value)}`)
  }
  return value
}

export const orgPrefix = (orgId: string): string => `orgs/${requireId('organisation', orgId)}/`

export const workspacePrefix = (orgId: string, workspaceId: string): string =>
  `${orgPrefix(orgId)}workspaces/${requireId('workspace', workspaceId)}/`

export const capturePrefix = (orgId: string, workspaceId: string, captureId: string): string =>
  `${workspacePrefix(orgId, workspaceId)}captures/${requireId('capture', captureId)}/`

export type ArtifactRef = {
  orgId: string
  workspaceId: string
  captureId: string
  role: ArtifactRole
  filename: string
}

export function artifactKey(ref: ArtifactRef): StorageKey {
  return (
    capturePrefix(ref.orgId, ref.workspaceId, ref.captureId) +
    `${ROLE_DIR[ref.role]}/${requireFilename(ref.filename)}`
  )
}

/** The probe object `preflight()` writes. Namespaced so it cannot collide with a capture. */
export const PREFLIGHT_PREFIX = '_snapit/preflight/'
