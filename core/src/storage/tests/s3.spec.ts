import { describe, expect, test } from 'vitest'
import { parseListing } from '../s3.ts'

describe('ListObjectsV2 parsing', () => {
  const page = (contents: string, truncated = false, token?: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${contents}` +
    `<IsTruncated>${truncated}</IsTruncated>` +
    (token ? `<NextContinuationToken>${token}</NextContinuationToken>` : '') +
    `</ListBucketResult>`

  test('reads the fields a capture deletion needs', () => {
    const { objects, nextToken } = parseListing(
      page(
        '<Contents><Key>orgs/acme/workspaces/web/captures/c1/media/v.mp4</Key>' +
          '<LastModified>2026-09-19T14:02:11.000Z</LastModified>' +
          '<ETag>&quot;abc123&quot;</ETag><Size>160123456</Size></Contents>'
      )
    )
    expect(objects).toEqual([
      {
        key: 'orgs/acme/workspaces/web/captures/c1/media/v.mp4',
        bytes: 160123456,
        contentType: null,
        updatedAt: '2026-09-19T14:02:11.000Z',
        etag: '&quot;abc123&quot;'
      }
    ])
    expect(nextToken).toBeNull()
  })

  test('surfaces the continuation token only while the listing is truncated', () => {
    expect(parseListing(page('', true, 'tok')).nextToken).toBe('tok')
    // A token on a complete page is S3 echoing the request; following it would loop.
    expect(parseListing(page('', false, 'tok')).nextToken).toBeNull()
  })

  test('un-escapes keys, so a capture named with an ampersand still deletes', () => {
    const { objects } = parseListing(page('<Contents><Key>a&amp;b/v.mp4</Key><Size>1</Size></Contents>'))
    expect(objects[0]!.key).toBe('a&b/v.mp4')
  })

  test('an empty prefix yields nothing rather than throwing', () => {
    expect(parseListing(page('')).objects).toEqual([])
    expect(parseListing('not xml at all').objects).toEqual([])
  })
})
