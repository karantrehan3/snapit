import { createAzureProvider } from './azure.ts'
import { createGcsProvider } from './gcs.ts'
import { createLocalProvider } from './local.ts'
import { createS3Provider } from './s3.ts'
import { StorageError, type StorageProvider } from './provider.ts'
import type { StorageConfig } from './config.ts'

/**
 * The one place that knows which providers exist.
 *
 * Everything above this line takes a `StorageProvider` and never learns which one it got,
 * which is the property that makes "bring your own bucket" a configuration choice rather
 * than a fork — and, just as importantly, makes the desktop app's save folder the same
 * kind of thing as somebody's S3 bucket.
 */
export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.provider) {
    case 'local':
      return createLocalProvider({
        root: config.root,
        publicUrl: config.publicUrl,
        signingSecret: config.signingSecret
      })
    case 's3':
      return createS3Provider({
        bucket: config.bucket,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          ...(config.sessionToken ? { sessionToken: config.sessionToken } : {})
        },
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle
      })
    case 'azure':
      return createAzureProvider({
        account: config.account,
        container: config.container,
        accountKey: config.accountKey
      })
    case 'gcs':
      return createGcsProvider({
        bucket: config.bucket,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey
      })
    default:
      // Unreachable while the union is exhaustive, but a deployment can hand us a string
      // that typechecked somewhere else and does not here.
      throw new StorageError(
        'misconfigured',
        `Unknown storage provider: ${(config as { provider: string }).provider}`
      )
  }
}
