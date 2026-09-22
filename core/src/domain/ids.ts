import { randomBytes, randomUUID } from 'node:crypto'

/**
 * Identifiers, and one decision that matters more than the rest.
 *
 * ROADMAP M1.7's third cost is retention: "a report with a real session's URLs and error
 * bodies now sits at a guessable URL for as long as the bucket keeps it". Half of that
 * sentence is answered by the workspace check on every read; the other half is answered
 * here. A share slug is 128 bits from `randomBytes`, not a counter, not a hash of the
 * title, and not a UUIDv7 with a timestamp in it — because a link that leaks is a link
 * that leaks *one* capture, and a link that is enumerable leaks the workspace.
 *
 * Crockford base32 rather than base64url: the slug appears in URLs people read aloud and
 * paste into tickets, and it excludes I, L, O and U so it cannot be mis-transcribed.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 128 bits, as 26 Crockford base32 characters. */
export function shareSlug(): string {
  const bytes = randomBytes(16)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31]
  return out.toLowerCase()
}

export const SHARE_SLUG_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{26}$/

export const isShareSlug = (value: string): boolean => SHARE_SLUG_PATTERN.test(value)

/**
 * Internal ids. Prefixed so a value in a log or an error says what it is — the cost of
 * four characters against the cost of not knowing whether `8f2e…` is a capture or a
 * workspace at three in the morning.
 */
const id = (prefix: string): string => `${prefix}-${randomUUID()}`

export const captureId = (): string => id('cap')
export const workspaceId = (): string => id('ws')
export const orgId = (): string => id('org')
export const userId = (): string => id('usr')
