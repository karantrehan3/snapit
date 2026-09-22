import { isProviderId, PROVIDER_IDS, type StorageConfig } from '@snapit/core/storage/config'
import type { StorageProviderId } from '@snapit/core/storage/provider'

/**
 * Configuration, read once and validated hard.
 *
 * Everything that can be wrong about a deployment is wrong here, and the alternative to
 * failing at boot is failing in a viewer six hours later — which is ROADMAP M1.7's
 * second cost ("support surface without control") arriving exactly as predicted. So
 * there are no defaults for anything that carries data, and no `||` fallbacks that turn
 * a typo into a working server pointed at the wrong bucket.
 */

export type AppConfig = {
  port: number
  /** How the outside world addresses this server. Share URLs are built from it. */
  publicUrl: string
  tokenSecret: string
  metadataFile: string
  /** `dev` is only reachable against local storage — see `auth/dev.ts`. */
  auth: { provider: 'dev' } | { provider: 'oidc'; issuer: string; clientId: string; clientSecret?: string }
  /** Core's shape, built here. Core itself never reads the environment. */
  storage: StorageConfig
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>

function required(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new ConfigError(`${name} is required.`)
  return value
}

const optional = (env: Env, name: string): string | undefined => env[name]?.trim() || undefined

/** Long enough that a stolen token cannot be brute-forced offline in a prototype's lifetime. */
const MIN_SECRET_LENGTH = 32

export function loadConfig(env: Env = process.env): AppConfig {
  const provider = optional(env, 'SNAPIT_STORAGE_PROVIDER') ?? 'local'
  if (!isProviderId(provider)) {
    throw new ConfigError(
      `SNAPIT_STORAGE_PROVIDER must be one of ${PROVIDER_IDS.join(', ')} — got "${provider}".`
    )
  }

  const tokenSecret = required(env, 'SNAPIT_TOKEN_SECRET')
  if (tokenSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`SNAPIT_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`)
  }

  const publicUrl =
    optional(env, 'SNAPIT_PUBLIC_URL') ?? `http://localhost:${optional(env, 'SNAPIT_PORT') ?? 8787}`
  try {
    new URL(publicUrl)
  } catch {
    throw new ConfigError(`SNAPIT_PUBLIC_URL is not a URL: ${publicUrl}`)
  }

  return {
    port: Number(optional(env, 'SNAPIT_PORT') ?? 8787),
    publicUrl: publicUrl.replace(/\/$/, ''),
    tokenSecret,
    metadataFile: optional(env, 'SNAPIT_METADATA_FILE') ?? './.data/metadata.json',
    // Storage first, deliberately. Both can be wrong at once, and an operator who just
    // set up a bucket should be told what is wrong with the bucket rather than about an
    // identity provider they have not reached yet.
    storage: storageConfig(provider, env, publicUrl.replace(/\/$/, ''), tokenSecret),
    auth: authConfig(env, provider)
  }
}

function storageConfig(
  provider: StorageProviderId,
  env: Env,
  publicUrl: string,
  signingSecret: string
): StorageConfig {
  switch (provider) {
    case 'local':
      return {
        provider,
        root: optional(env, 'SNAPIT_LOCAL_ROOT') ?? './.data/objects',
        publicUrl,
        signingSecret
      }
    case 's3':
      return {
        provider,
        bucket: required(env, 'SNAPIT_S3_BUCKET'),
        region: required(env, 'SNAPIT_S3_REGION'),
        accessKeyId: required(env, 'SNAPIT_S3_ACCESS_KEY_ID'),
        secretAccessKey: required(env, 'SNAPIT_S3_SECRET_ACCESS_KEY'),
        endpoint: optional(env, 'SNAPIT_S3_ENDPOINT'),
        forcePathStyle: optional(env, 'SNAPIT_S3_FORCE_PATH_STYLE') === 'true'
      }
    case 'azure':
      return {
        provider,
        account: required(env, 'SNAPIT_AZURE_ACCOUNT'),
        container: required(env, 'SNAPIT_AZURE_CONTAINER'),
        accountKey: required(env, 'SNAPIT_AZURE_ACCOUNT_KEY')
      }
    case 'gcs':
      return {
        provider,
        bucket: required(env, 'SNAPIT_GCS_BUCKET'),
        clientEmail: required(env, 'SNAPIT_GCS_CLIENT_EMAIL'),
        privateKey: required(env, 'SNAPIT_GCS_PRIVATE_KEY')
      }
  }
}

/**
 * Which identity provider, and the guard that matters.
 *
 * `dev` authenticates nothing, so it is refused against any storage but `local`. That check
 * is here rather than in the provider because a server pointed at a customer's bucket must
 * fail to *start*, not fail at the first sign-in — by which point it is already listening.
 */
function authConfig(env: Env, storage: StorageProviderId): AppConfig['auth'] {
  const provider = optional(env, 'SNAPIT_AUTH_PROVIDER') ?? (storage === 'local' ? 'dev' : 'oidc')

  if (provider === 'dev') {
    if (storage !== 'local') {
      throw new ConfigError(
        'SNAPIT_AUTH_PROVIDER=dev authenticates nobody and is refused against real storage. ' +
          'Use oidc, or run against the local provider.'
      )
    }
    return { provider: 'dev' }
  }

  if (provider !== 'oidc') {
    throw new ConfigError(`SNAPIT_AUTH_PROVIDER must be dev or oidc — got "${provider}".`)
  }
  return {
    provider: 'oidc',
    issuer: required(env, 'SNAPIT_OIDC_ISSUER'),
    clientId: required(env, 'SNAPIT_OIDC_CLIENT_ID'),
    clientSecret: optional(env, 'SNAPIT_OIDC_CLIENT_SECRET')
  }
}
