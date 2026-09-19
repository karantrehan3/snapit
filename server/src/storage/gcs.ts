import { unimplementedProvider } from './unimplemented.ts'
import type { StorageProvider } from './provider.ts'

export type GcsConfig = { bucket: string; clientEmail: string; privateKey: string }

/**
 * Google Cloud Storage — shaped, not built.
 *
 * The closest of the three to S3: GCS V4 signed URLs use the same canonical-request →
 * string-to-sign → signature structure as SigV4, so `sigv4.ts` is most of the shape. The
 * two substantive differences:
 *
 * 1. **RSA, not HMAC.** The signature is `RSA-SHA256` over the string-to-sign using a
 *    service account's private key (`crypto.sign('RSA-SHA256', …)`), and the credential
 *    scope is `{clientEmail}/{date}/auto/storage/goog4_request`. Every parameter is
 *    `X-Goog-*` rather than `X-Amz-*`.
 * 2. **The key is a real secret.** An S3 access key is a secret too, but a service
 *    account private key is the one that most often ends up pasted into an env var and
 *    then into a log. If this gets built, it should read a file path and never a value —
 *    which is a config-shape decision, hence writing it down before anyone starts.
 *
 * GCS also speaks an S3-compatible XML API with HMAC keys, so a team that wants GCS
 * today can point `SNAPIT_STORAGE_PROVIDER=s3` at `https://storage.googleapis.com` with
 * an HMAC key pair and `forcePathStyle`. That is the recommended route until someone
 * needs workload identity, which is the only thing it cannot do.
 */
export const createGcsProvider = (_config: GcsConfig): StorageProvider =>
  unimplementedProvider(
    'gcs',
    'Use SNAPIT_STORAGE_PROVIDER=s3 against https://storage.googleapis.com with an HMAC key pair, ' +
      'which works today. Native GCS needs RSA-SHA256 V4 signing — see src/storage/gcs.ts.'
  )
