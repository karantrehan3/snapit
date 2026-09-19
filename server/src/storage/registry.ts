import type { AppConfig } from '../config.ts'
import { createAzureProvider } from './azure.ts'
import { createGcsProvider } from './gcs.ts'
import { createLocalProvider } from './local.ts'
import { createS3Provider } from './s3.ts'
import type { StorageProvider } from './provider.ts'

/**
 * The one place that knows which providers exist.
 *
 * Everything above this line takes a `StorageProvider` and never learns which one it
 * got — which is the property the whole abstraction is for, and the property that makes
 * "bring your own bucket" a configuration choice rather than a fork.
 */
export function createStorageProvider(config: AppConfig): StorageProvider {
  const s = config.storage
  switch (s.provider) {
    case 'local':
      return createLocalProvider({
        root: s.root,
        publicUrl: config.publicUrl,
        signingSecret: config.tokenSecret
      })
    case 's3':
      return createS3Provider({
        bucket: s.bucket,
        region: s.region,
        credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
        endpoint: s.endpoint,
        forcePathStyle: s.forcePathStyle
      })
    case 'azure':
      return createAzureProvider({ account: s.account, container: s.container, accountKey: s.accountKey })
    case 'gcs':
      return createGcsProvider({ bucket: s.bucket, clientEmail: s.clientEmail, privateKey: s.privateKey })
  }
}
