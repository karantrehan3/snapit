import { describe, expect, test } from 'vitest'
import { ConfigError, loadConfig } from '../config.ts'

/**
 * Configuration is where every deployment mistake shows up, and the alternative to failing
 * here is failing in a viewer six hours later. So these tests are about refusal as much as
 * about parsing.
 */
const SECRET = 'a-secret-that-is-at-least-32-characters'
const base = { SNAPIT_TOKEN_SECRET: SECRET }

describe('defaults', () => {
  test('needs only a secret, and lands on the local provider', () => {
    const config = loadConfig(base)
    expect(config.storage.provider).toBe('local')
    expect(config.port).toBe(8787)
    expect(config.publicUrl).toBe('http://localhost:8787')
  })

  test('derives publicUrl from the port when only the port is given', () => {
    expect(loadConfig({ ...base, SNAPIT_PORT: '9000' }).publicUrl).toBe('http://localhost:9000')
  })

  test('strips a trailing slash, so share URLs never double up', () => {
    expect(loadConfig({ ...base, SNAPIT_PUBLIC_URL: 'https://snapit.corp/' }).publicUrl).toBe(
      'https://snapit.corp'
    )
  })

  test('passes the public URL and signing secret down to the local provider', () => {
    // The local provider signs URLs that point back at this server, so it needs both.
    const storage = loadConfig({ ...base, SNAPIT_PUBLIC_URL: 'https://x.corp' }).storage
    expect(storage).toMatchObject({ provider: 'local', publicUrl: 'https://x.corp', signingSecret: SECRET })
  })
})

describe('refusals', () => {
  test('a missing secret stops the boot', () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
  })

  test('a short secret stops the boot, rather than signing tokens with it', () => {
    expect(() => loadConfig({ SNAPIT_TOKEN_SECRET: 'too-short' })).toThrow(/at least 32/)
  })

  test('an unknown provider names the ones that exist', () => {
    expect(() => loadConfig({ ...base, SNAPIT_STORAGE_PROVIDER: 'gcp' })).toThrow(/local, s3, azure, gcs/)
  })

  test('a public URL that is not a URL stops the boot', () => {
    expect(() => loadConfig({ ...base, SNAPIT_PUBLIC_URL: 'not a url' })).toThrow(ConfigError)
  })

  test.each([
    'SNAPIT_S3_BUCKET',
    'SNAPIT_S3_REGION',
    'SNAPIT_S3_ACCESS_KEY_ID',
    'SNAPIT_S3_SECRET_ACCESS_KEY'
  ])('s3 without %s stops the boot', (missing) => {
    const env: Record<string, string> = {
      ...base,
      SNAPIT_STORAGE_PROVIDER: 's3',
      SNAPIT_S3_BUCKET: 'b',
      SNAPIT_S3_REGION: 'eu-west-1',
      SNAPIT_S3_ACCESS_KEY_ID: 'k',
      SNAPIT_S3_SECRET_ACCESS_KEY: 's'
    }
    delete env[missing]
    expect(() => loadConfig(env)).toThrow(new RegExp(missing))
  })

  test('whitespace is not a value', () => {
    expect(() => loadConfig({ SNAPIT_TOKEN_SECRET: '   ' })).toThrow(ConfigError)
  })
})

describe('s3', () => {
  const s3 = {
    ...base,
    SNAPIT_STORAGE_PROVIDER: 's3',
    SNAPIT_S3_BUCKET: 'snapit-captures',
    SNAPIT_S3_REGION: 'eu-west-1',
    SNAPIT_S3_ACCESS_KEY_ID: 'AKIA',
    SNAPIT_S3_SECRET_ACCESS_KEY: 'secret'
  }

  test('builds the shape core expects', () => {
    expect(loadConfig(s3).storage).toEqual({
      provider: 's3',
      bucket: 'snapit-captures',
      region: 'eu-west-1',
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      endpoint: undefined,
      forcePathStyle: false
    })
  })

  test('MinIO needs path-style, and only "true" turns it on', () => {
    expect(loadConfig({ ...s3, SNAPIT_S3_FORCE_PATH_STYLE: 'true' }).storage).toMatchObject({
      forcePathStyle: true
    })
    expect(loadConfig({ ...s3, SNAPIT_S3_FORCE_PATH_STYLE: 'yes' }).storage).toMatchObject({
      forcePathStyle: false
    })
  })
})
