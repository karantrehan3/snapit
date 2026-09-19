import type { StorageProviderId } from './storage/provider.ts'

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
  storage:
    | { provider: 'local'; root: string }
    | {
        provider: 's3'
        bucket: string
        region: string
        accessKeyId: string
        secretAccessKey: string
        endpoint?: string
        forcePathStyle: boolean
      }
    | { provider: 'azure'; account: string; container: string; accountKey: string }
    | { provider: 'gcs'; bucket: string; clientEmail: string; privateKey: string }
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>

function required(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new ConfigError(`${name} is required.`)
  return value
}

const optional = (env: Env, name: string): string | undefined => env[name]?.trim() || undefined

const PROVIDERS: readonly StorageProviderId[] = ['local', 's3', 'azure', 'gcs']

/** Long enough that a stolen token cannot be brute-forced offline in a prototype's lifetime. */
const MIN_SECRET_LENGTH = 32

export function loadConfig(env: Env = process.env): AppConfig {
  const provider = (optional(env, 'SNAPIT_STORAGE_PROVIDER') ?? 'local') as StorageProviderId
  if (!PROVIDERS.includes(provider)) {
    throw new ConfigError(
      `SNAPIT_STORAGE_PROVIDER must be one of ${PROVIDERS.join(', ')} — got "${provider}".`
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
    storage: storageConfig(provider, env)
  }
}

function storageConfig(provider: StorageProviderId, env: Env): AppConfig['storage'] {
  switch (provider) {
    case 'local':
      return { provider, root: optional(env, 'SNAPIT_LOCAL_ROOT') ?? './.data/objects' }
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
