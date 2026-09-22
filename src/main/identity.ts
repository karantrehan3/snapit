import { can as roleCan, permissionsFor, type Permission, type Role } from '@snapit/core/domain/rbac'

/**
 * Who is using snapit, and what they may do.
 *
 * The first half of M3.0's seam. It exists so that no view ever writes
 * `if (connected && role === 'admin')` — every surface asks `identity.can(…)` and the
 * answer arrives from whichever identity is in play. Get this wrong and connected mode
 * becomes a fork of the UI rather than a different implementation behind it.
 *
 * **Locally the answer is always yes**, and that is deliberate rather than a stub: it is
 * one person, on their own machine, reading their own save folder. A single user must
 * never meet a permission check. The value of asking is that the same component works
 * unchanged when the answer starts coming from a server.
 */

export type IdentityMode = 'local' | 'connected'

export type Identity = {
  mode: IdentityMode
  userId: string
  role: Role
  can: (permission: Permission) => boolean
  permissions: readonly Permission[]
}

/**
 * The installer.
 *
 * `ROADMAP.md` M3.1 settles on `owner` as the top role; core still calls it `admin`, and
 * the two grant the same thing today. This is the single place that has to change when
 * the rename lands, which is why the role is named once here rather than at each call.
 */
const LOCAL_ROLE: Role = 'admin'

export function localIdentity(userId: string): Identity {
  return {
    mode: 'local',
    userId,
    role: LOCAL_ROLE,
    can: (permission) => roleCan(LOCAL_ROLE, permission),
    permissions: permissionsFor(LOCAL_ROLE)
  }
}

/** What crosses IPC: the answers, never the functions. */
export type IdentitySnapshot = {
  mode: IdentityMode
  userId: string
  role: Role
  permissions: readonly Permission[]
}

/** A signed-in member of a workspace on a snapit server. Not reachable yet — see M3.0. */
export function remoteIdentity(userId: string, role: Role): Identity {
  return {
    mode: 'connected',
    userId,
    role,
    can: (permission) => roleCan(role, permission),
    permissions: permissionsFor(role)
  }
}
