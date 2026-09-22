import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { devSecretPath } from '../src/devSecret.ts'
import { issueToken } from '@snapit/core/auth/tokens'
import type { Role } from '@snapit/core/domain/rbac'

/**
 * Minting a token from `.data/`, for the development scripts.
 *
 * This is only legitimate because it is a development tool reading the same directory the
 * secret lives in — it already has everything that secret would protect. It does not work
 * against a real deployment and must never grow to: there, a client signs in and the
 * server issues the token.
 *
 * Shared by `push.ts` and `token.ts` so there is one copy of "which workspace, which
 * admin", and one place to change when Phase 3's `owner` role lands.
 */

export const DATA_DIR = resolve(process.env.SNAPIT_DATA_DIR ?? './.data')
export const API = (process.env.SNAPIT_PUBLIC_URL ?? 'http://localhost:8787').replace(/\/$/, '')

export class DevAuthError extends Error {
  readonly hint: string
  constructor(message: string, hint: string) {
    super(message)
    this.hint = hint
  }
}

type Snapshot = {
  workspaces?: Array<{ id: string; orgId: string; name: string }>
  memberships?: Array<{ userId: string; workspaceId: string; role: string }>
}

function secret(): string {
  if (process.env.SNAPIT_TOKEN_SECRET) return process.env.SNAPIT_TOKEN_SECRET
  try {
    return readFileSync(devSecretPath(DATA_DIR), 'utf-8').trim()
  } catch {
    throw new DevAuthError('No development secret yet.', 'Start the server first:  npm start')
  }
}

export type DevSession = { token: string; workspaceId: string; orgId: string; userId: string }

/** A short-lived token for the seeded member holding `role`. Ten minutes. */
export function devSession(role: Role = 'admin'): DevSession {
  let snapshot: Snapshot
  try {
    snapshot = JSON.parse(readFileSync(join(DATA_DIR, 'metadata.json'), 'utf-8')) as Snapshot
  } catch {
    throw new DevAuthError('The server has not been started yet.', 'Run "npm start" first, then retry.')
  }

  const workspace = snapshot.workspaces?.[0]
  if (!workspace) throw new DevAuthError('The server has no workspace yet.', 'Start it once:  npm start')

  const membership = snapshot.memberships?.find((m) => m.workspaceId === workspace.id && m.role === role)
  if (!membership)
    throw new DevAuthError(`No seeded ${role} in ${workspace.id}.`, 'Delete .data/ and restart.')

  return {
    // Ten minutes: long enough to upload a large recording, short enough that a token left
    // in a shell history is worthless by the time anybody finds it.
    token: issueToken(secret(), {
      sub: membership.userId,
      ws: workspace.id,
      org: workspace.orgId,
      role,
      exp: Math.floor(Date.now() / 1000) + 600
    }),
    workspaceId: workspace.id,
    orgId: workspace.orgId,
    userId: membership.userId
  }
}

/** Print a failure the way the scripts do, and stop. */
export function die(message: string, hint?: string): never {
  console.error(`\n  ✗ ${message}`)
  if (hint) console.error(`    ${hint}`)
  console.error('')
  process.exit(1)
}
