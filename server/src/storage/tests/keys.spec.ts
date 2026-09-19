import { describe, expect, test } from 'vitest'
import { artifactKey, capturePrefix, requireFilename, workspacePrefix } from '../keys.ts'
import { StorageError } from '../provider.ts'

const ref = { orgId: 'acme', workspaceId: 'web', captureId: 'cap-7', role: 'media' as const }

describe('key layout', () => {
  test('nests capture keys under org and workspace so a prefix deletes a workspace', () => {
    expect(artifactKey({ ...ref, filename: 'snapit-2026.mp4' })).toBe(
      'orgs/acme/workspaces/web/captures/cap-7/media/snapit-2026.mp4'
    )
    expect(artifactKey({ ...ref, filename: 'a.mp4' }).startsWith(workspacePrefix('acme', 'web'))).toBe(true)
    expect(capturePrefix('acme', 'web', 'cap-7').startsWith(workspacePrefix('acme', 'web'))).toBe(true)
  })

  test('separates the three roles, which have three different exposure profiles', () => {
    const at = (role: 'report' | 'media' | 'data', filename: string): string =>
      artifactKey({ ...ref, role, filename })
    expect(at('report', 'report.html')).toContain('/report/report.html')
    expect(at('media', 'v.mp4')).toContain('/media/v.mp4')
    expect(at('data', 'network.har')).toContain('/data/network.har')
  })
})

describe('untrusted names', () => {
  test.each(['../secret', 'a/b', 'a\\b', '.hidden', '', 'x'.repeat(200), 'nul\u0000name'])(
    'refuses %j rather than sanitising it',
    (name) => {
      expect(() => requireFilename(name)).toThrow(StorageError)
    }
  )

  test('a traversal spelled with legal characters is still refused', () => {
    // Every character here passes the character class; the pair does not.
    expect(() => requireFilename('a..b')).toThrow(StorageError)
  })

  test('refuses an id that would escape its own prefix', () => {
    expect(() => capturePrefix('acme', '../other', 'cap-7')).toThrow(StorageError)
    expect(() => capturePrefix('acme', 'web', 'Cap_7')).toThrow(StorageError)
  })

  test('accepts the shapes real artifacts have', () => {
    for (const name of [
      'report.html',
      'network.har',
      'generated.spec.ts',
      'snapit-2026-09-19-14-02-11.mp4'
    ]) {
      expect(requireFilename(name)).toBe(name)
    }
  })
})
