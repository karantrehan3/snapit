import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

/**
 * The token secret, for a local install that has not been given one.
 *
 * `config.ts` refuses to invent anything that carries data, and that rule stands — this is
 * the one exception and it is narrow on purpose. A secret signing tokens for a server
 * bound to one developer's machine, against a filesystem "bucket" in `.data/`, protects
 * nothing that is not already readable by whoever can read `.data/`. Making it mandatory
 * there bought no safety and cost the first thing anybody trying this hits.
 *
 * It is **only** reachable when the storage provider is `local`. Any real provider still
 * requires `SNAPIT_TOKEN_SECRET`, because there the secret guards someone else's bucket.
 *
 * Persisted rather than regenerated, or every restart would silently invalidate every
 * token that had been issued — which looks exactly like a bug in the auth code.
 */

const FILE = 'dev-secret'

export function ensureDevSecret(dataDir: string): string {
  const path = join(dataDir, FILE)
  try {
    const existing = readFileSync(path, 'utf-8').trim()
    if (existing.length >= 32) return existing
  } catch {
    // Not there yet, or unreadable — either way, write a fresh one below.
  }
  const secret = randomBytes(32).toString('hex')
  mkdirSync(dataDir, { recursive: true })
  // 0600: it signs tokens, so it is a secret even when it is a development one.
  writeFileSync(path, `${secret}\n`, { encoding: 'utf-8', mode: 0o600 })
  return secret
}

export const devSecretPath = (dataDir: string): string => join(dataDir, FILE)
