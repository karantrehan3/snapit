import { describe, it, expect } from 'vitest'
import { MAX_BODY_CHARS, attachResponseBodies, isFailedStatus } from '../bodies'

describe('isFailedStatus', () => {
  it('treats 4xx and 5xx as failures', () => {
    expect(isFailedStatus(404)).toBe(true)
    expect(isFailedStatus(500)).toBe(true)
  })

  it('treats a request that never got a response as a failure', () => {
    expect(isFailedStatus(0)).toBe(true)
  })

  it('leaves successes and redirects alone', () => {
    expect(isFailedStatus(200)).toBe(false)
    expect(isFailedStatus(302)).toBe(false)
    expect(isFailedStatus(undefined)).toBe(false)
  })
})

describe('attachResponseBodies', () => {
  const har = {
    log: {
      entries: [
        { _requestId: 'a', response: { status: 500, content: { mimeType: 'application/json' } } },
        { _requestId: 'b', response: { status: 200, content: { mimeType: 'text/html' } } },
        { _requestId: 'c', response: { status: 404, content: { mimeType: 'image/png' } } }
      ]
    }
  }

  it('attaches a body to the entry it belongs to, by request id', () => {
    const out = attachResponseBodies(har, { a: { text: '{"error":"kaboom"}', base64Encoded: false } })
    expect(out.log.entries[0].response.content.text).toBe('{"error":"kaboom"}')
  })

  it('leaves entries with no fetched body untouched', () => {
    const out = attachResponseBodies(har, { a: { text: 'x', base64Encoded: false } })
    expect(out.log.entries[1].response.content.text).toBeUndefined()
  })

  it('drops a binary body rather than storing a base64 blob nobody can read', () => {
    const out = attachResponseBodies(har, { c: { text: 'iVBORw0KGgo=', base64Encoded: true } })
    expect(out.log.entries[2].response.content.text).toBeUndefined()
  })

  it('caps an enormous body so one HTML error page cannot dominate the file', () => {
    const out = attachResponseBodies(har, {
      a: { text: 'x'.repeat(MAX_BODY_CHARS * 3), base64Encoded: false }
    })
    const text = out.log.entries[0].response.content.text as string
    expect(text.length).toBeLessThan(MAX_BODY_CHARS + 10)
    expect(text.endsWith('...')).toBe(true)
  })

  it('keeps the rest of the entry, including what chrome-har worked out', () => {
    const out = attachResponseBodies(har, { a: { text: 'boom', base64Encoded: false } })
    expect(out.log.entries[0].response.status).toBe(500)
    expect(out.log.entries[0].response.content.mimeType).toBe('application/json')
  })

  it('does not mutate the HAR it was given', () => {
    attachResponseBodies(har, { a: { text: 'boom', base64Encoded: false } })
    expect(har.log.entries[0].response.content).not.toHaveProperty('text')
  })

  it('survives a malformed or empty HAR', () => {
    expect(attachResponseBodies({ log: { entries: [] } }, {})).toEqual({ log: { entries: [] } })
    expect(attachResponseBodies({}, {})).toEqual({})
  })
})
