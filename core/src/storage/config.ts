import type { StorageProviderId } from './provider.ts'

/**
 * What a provider needs, as a plain value.
 *
 * Deliberately not read from the environment. Core has no opinion about where a
 * deployment keeps its settings — the server builds this from env vars, and the desktop
 * app builds it from its own settings file. A core that read `process.env` would work in
 * exactly one of those.
 */
export type StorageConfig =
  | {
      provider: 'local'
      /** Directory the objects live under. In the app, the save folder. */
      root: string
      /**
       * Where signed URLs point. Only meaningful when something is serving HTTP; the app
       * calling in-process never mints one.
       */
      publicUrl: string
      signingSecret: string
    }
  | {
      provider: 's3'
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      sessionToken?: string
      /** Omit for AWS. MinIO, R2, Ceph and GCS's S3 endpoint go here. */
      endpoint?: string
      forcePathStyle?: boolean
    }
  | { provider: 'azure'; account: string; container: string; accountKey: string }
  | { provider: 'gcs'; bucket: string; clientEmail: string; privateKey: string }

export const PROVIDER_IDS: readonly StorageProviderId[] = ['local', 's3', 'azure', 'gcs']

export const isProviderId = (value: string): value is StorageProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value)
