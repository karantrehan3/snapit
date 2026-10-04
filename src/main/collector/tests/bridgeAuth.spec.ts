import { describe, expect, test } from 'vitest'
import {
  checkCollectorRequest,
  checkPairRequest,
  extensionOrigin,
  isOurExtension,
  versionsAgree
} from '../bridgeAuth'

const ID = 'flhandipbjjgpogpdoemadcebhjlgneo'
const ORIGIN = extensionOrigin(ID)
const TOKEN = 'a-collector-token-of-reasonable-length'
const bearer = (t: string): string => `Bearer ${t}`

describe('origin', () => {
  test('accepts our extension', () => {
    expect(isOurExtension(ORIGIN, ID)).toBe(true)
  })

  test.each([
    ['a web page', 'https://evil.test'],
    ['localhost, which is where an attacker would already be', 'http://127.0.0.1:47318'],
    ['another extension', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['a prefix of ours', `chrome-extension://${ID.slice(0, -1)}`],
    ['no origin at all — curl, or a local script', undefined],
    ['empty', '']
  ])('refuses %s', (_label, origin) => {
    expect(isOurExtension(origin, ID)).toBe(false)
  })

  test('refuses everything when no id is configured, rather than matching loosely', () => {
    expect(isOurExtension(ORIGIN, '')).toBe(false)
  })

  test('takes the first value when the header arrives twice', () => {
    expect(isOurExtension([ORIGIN, 'https://evil.test'], ID)).toBe(true)
    expect(isOurExtension(['https://evil.test', ORIGIN], ID)).toBe(false)
  })
})

describe('pairing', () => {
  test('hands over the token only when the app has enabled it', () => {
    expect(checkPairRequest(ORIGIN, ID, true)).toEqual({ ok: true })
  })

  test('refuses while pairing is off, even from the right extension', () => {
    // A request must not be able to raise a dialog, or anything local can make the
    // machine beep all day.
    expect(checkPairRequest(ORIGIN, ID, false)).toMatchObject({ ok: false, status: 403 })
  })

  test('refuses a stranger even while pairing is on', () => {
    expect(checkPairRequest('https://evil.test', ID, true)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('collecting', () => {
  test('accepts the right origin with the right token', () => {
    expect(checkCollectorRequest(ORIGIN, bearer(TOKEN), ID, TOKEN)).toEqual({ ok: true })
  })

  test('403 for a bad origin, 401 for a bad token — the order matters', () => {
    // Origin first: a stranger should not learn whether a token was close.
    expect(checkCollectorRequest('https://evil.test', bearer(TOKEN), ID, TOKEN)).toMatchObject({
      status: 403
    })
    expect(checkCollectorRequest(ORIGIN, bearer('wrong'), ID, TOKEN)).toMatchObject({ status: 401 })
    expect(checkCollectorRequest(ORIGIN, undefined, ID, TOKEN)).toMatchObject({ status: 401 })
  })

  test('refuses when the app has no token, rather than accepting an empty one', () => {
    expect(checkCollectorRequest(ORIGIN, bearer(''), ID, '')).toMatchObject({ ok: false })
    expect(checkCollectorRequest(ORIGIN, bearer('anything'), ID, '')).toMatchObject({ ok: false })
  })
})

describe('version agreement', () => {
  test('agrees on the same major', () => {
    expect(versionsAgree('0.1.0', '0.1.0')).toBe(true)
    expect(versionsAgree('0.9.3', '0.1.0')).toBe(true)
  })

  test('disagrees across majors, because that is what changes the wire', () => {
    // An unpacked extension does not auto-update, so this is the normal way snapit and a
    // stale extension meet — and it shows up as a short session, not an error.
    expect(versionsAgree('1.0.0', '2.0.0')).toBe(false)
  })

  test.each(['', 'nonsense', '.1.0'])('refuses an unreadable version %j', (v) => {
    expect(versionsAgree(v, '1.0.0')).toBe(false)
  })
})
