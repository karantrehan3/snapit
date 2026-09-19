/**
 * Roles and what they may do.
 *
 * Kept as a table rather than a tree of `if (role === 'admin' || …)`, for one reason
 * that is worth the indirection: this file is the complete answer to "who can see a
 * capture", and a reviewer should be able to check it by reading rather than by
 * simulating. Every call site takes a `Permission`, never a `Role`.
 *
 * Three roles, deliberately, as the brief asks. The shape that would come next is a
 * per-capture visibility override — a capture shared outside the workspace — and the
 * seam for it is `visibility` on the capture record, checked *before* this table is
 * consulted. That order matters: a link that works without a login must not be a hole
 * that a role check was supposed to cover.
 */

export const ROLES = ['admin', 'developer', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'capture:read',
  'capture:create',
  'capture:delete',
  /** Mint or revoke a public share link. Strictly more than `capture:read`. */
  'capture:share',
  'member:read',
  'member:manage',
  'integration:use',
  'integration:manage',
  'workspace:configure'
] as const
export type Permission = (typeof PERMISSIONS)[number]

const VIEWER: readonly Permission[] = ['capture:read', 'member:read']

/**
 * A developer may file a Jira issue from a capture but may not configure the Jira
 * connection, and may not mint a public link. Both are the same judgement: the actions
 * that move a QA environment's data outside the workspace are the ones an admin owns.
 */
const DEVELOPER: readonly Permission[] = [...VIEWER, 'capture:create', 'capture:delete', 'integration:use']

const ADMIN: readonly Permission[] = [
  ...DEVELOPER,
  'capture:share',
  'member:manage',
  'integration:manage',
  'workspace:configure'
]

const GRANTS: Record<Role, readonly Permission[]> = {
  admin: ADMIN,
  developer: DEVELOPER,
  viewer: VIEWER
}

export const can = (role: Role, permission: Permission): boolean => GRANTS[role].includes(permission)

export const permissionsFor = (role: Role): readonly Permission[] => GRANTS[role]

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)
