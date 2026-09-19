import { describe, expect, test } from 'vitest'
import { PERMISSIONS, ROLES, can, isRole, permissionsFor, type Permission } from '../rbac.ts'

describe('roles', () => {
  test('a viewer can read and nothing else', () => {
    const allowed = PERMISSIONS.filter((p) => can('viewer', p))
    expect(allowed).toEqual(['capture:read', 'member:read'])
  })

  test('a developer can produce and remove captures but cannot share them publicly', () => {
    expect(can('developer', 'capture:create')).toBe(true)
    expect(can('developer', 'capture:delete')).toBe(true)
    expect(can('developer', 'integration:use')).toBe(true)
    // Minting a link puts a QA environment's error bodies outside the workspace.
    expect(can('developer', 'capture:share')).toBe(false)
    expect(can('developer', 'integration:manage')).toBe(false)
    expect(can('developer', 'member:manage')).toBe(false)
  })

  test('an admin holds every permission, so no capability is unreachable', () => {
    for (const permission of PERMISSIONS) expect(can('admin', permission)).toBe(true)
  })

  test('the roles nest, so a grant can never be narrower further up', () => {
    const superset = (wide: Permission[], narrow: readonly Permission[]): boolean =>
      narrow.every((p) => wide.includes(p))
    expect(superset([...permissionsFor('admin')], permissionsFor('developer'))).toBe(true)
    expect(superset([...permissionsFor('developer')], permissionsFor('viewer'))).toBe(true)
  })

  test('every declared permission is granted to somebody', () => {
    for (const permission of PERMISSIONS) {
      expect(ROLES.some((role) => can(role, permission))).toBe(true)
    }
  })
})

describe('isRole', () => {
  test.each([...ROLES])('accepts %s', (role) => expect(isRole(role)).toBe(true))
  test.each(['owner', 'ADMIN', '', null, undefined, 0, {}])('refuses %j', (value) =>
    expect(isRole(value)).toBe(false)
  )
})
