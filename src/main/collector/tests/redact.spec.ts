import { describe, it, expect } from 'vitest'
import {
  REDACTED,
  isSensitiveField,
  redactCookies,
  redactHar,
  redactJsonText,
  redactNameValues,
  redactUrl
} from '../redact'

describe('isSensitiveField', () => {
  it('catches the usual credential names however they are cased or separated', () => {
    for (const n of ['Authorization', 'access_token', 'API-KEY', 'clientSecret', 'X-Auth', 'password']) {
      expect(isSensitiveField(n)).toBe(true)
    }
  })

  it('leaves ordinary fields alone', () => {
    for (const n of ['page', 'userId', 'email', 'content-type', 'orderNumber']) {
      expect(isSensitiveField(n)).toBe(false)
    }
  })
})

describe('redactNameValues', () => {
  it('replaces credential headers but keeps the rest readable', () => {
    const out = redactNameValues([
      { name: 'Authorization', value: 'Bearer abc.def.ghi' },
      { name: 'Content-Type', value: 'application/json' }
    ])
    expect(out[0].value).toBe(REDACTED)
    expect(out[1].value).toBe('application/json')
  })

  it('survives a missing header list', () => {
    expect(redactNameValues(undefined)).toEqual([])
  })
})

describe('redactCookies', () => {
  it('keeps names but never values — a session cookie is the whole account', () => {
    const out = redactCookies([{ name: 'sid', value: 's%3Areal-session' }])
    expect(out).toEqual([{ name: 'sid', value: REDACTED }])
  })
})

describe('redactUrl', () => {
  it('rewrites a token in the query string', () => {
    const out = redactUrl('https://api.test/v1/me?access_token=secret&page=2')
    expect(out).not.toContain('secret')
    expect(out).toContain('page=2')
  })

  it('leaves a clean URL byte-identical', () => {
    const url = 'https://api.test/v1/orders?page=2&sort=asc'
    expect(redactUrl(url)).toBe(url)
  })

  it('passes through anything that is not a parseable URL', () => {
    expect(redactUrl('data:text/html,<p>hi')).toBe('data:text/html,<p>hi')
    expect(redactUrl('not a url')).toBe('not a url')
  })
})

describe('redactJsonText', () => {
  it('redacts secrets at any depth', () => {
    const out = redactJsonText(JSON.stringify({ user: { name: 'Ada', password: 'hunter2' } }))
    expect(out).not.toContain('hunter2')
    expect(out).toContain('Ada')
  })

  it('redacts inside arrays', () => {
    const out = redactJsonText(JSON.stringify({ items: [{ token: 'aaa' }, { token: 'bbb' }] }))
    expect(out).not.toContain('aaa')
    expect(out).not.toContain('bbb')
  })

  it('returns non-JSON untouched rather than mangling it', () => {
    expect(redactJsonText('<html>not json</html>')).toBe('<html>not json</html>')
  })
})

describe('redactHar', () => {
  const har = {
    log: {
      version: '1.2',
      entries: [
        {
          request: {
            url: 'https://api.test/login?api_key=leaked',
            headers: [
              { name: 'authorization', value: 'Bearer real' },
              { name: 'accept', value: 'application/json' }
            ],
            cookies: [{ name: 'sid', value: 'real-session' }],
            queryString: [{ name: 'api_key', value: 'leaked' }],
            postData: { mimeType: 'application/json', text: '{"password":"hunter2","email":"a@b.c"}' }
          },
          response: {
            status: 500,
            headers: [{ name: 'set-cookie', value: 'sid=rotated; HttpOnly' }],
            cookies: [{ name: 'sid', value: 'rotated' }],
            content: { mimeType: 'application/json', text: '{"error":"boom","token":"leaked2"}' }
          }
        }
      ]
    }
  }

  const out = redactHar(har)
  const serialized = JSON.stringify(out)
  const entry = out.log.entries[0]

  it('leaves no credential anywhere in the serialized result', () => {
    // The blunt assertion is the point: this is what actually ships in the bundle.
    for (const secret of ['Bearer real', 'real-session', 'leaked', 'hunter2', 'rotated', 'leaked2']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('keeps everything that makes the capture useful', () => {
    expect(entry.response.status).toBe(500)
    expect(entry.response.content.text).toContain('boom')
    expect(entry.request.postData.text).toContain('a@b.c')
    expect(entry.request.headers.find((h) => h.name === 'accept')?.value).toBe('application/json')
    expect(out.log.version).toBe('1.2')
  })

  it('keeps cookie names so a reader can still see which were sent', () => {
    expect(entry.request.cookies[0].name).toBe('sid')
  })

  it('survives a HAR with no entries at all', () => {
    expect(redactHar({ log: { entries: [] } }).log.entries).toEqual([])
    expect(redactHar({} as { log?: { entries?: [] } })).toEqual({})
  })
})
