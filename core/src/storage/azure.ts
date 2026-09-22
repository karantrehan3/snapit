import { unimplementedProvider } from './unimplemented.ts'
import type { StorageProvider } from './provider.ts'

export type AzureConfig = { account: string; container: string; accountKey: string }

/**
 * Azure Blob Storage — shaped, not built.
 *
 * It is here to answer the question the abstraction exists to answer: does
 * `StorageProvider` fit a store that is not S3? It does, and the mapping is small enough
 * to write down:
 *
 * | `StorageProvider` | Azure                                                          |
 * | ----------------- | -------------------------------------------------------------- |
 * | `put`             | `PUT {blob}` with `x-ms-blob-type: BlockBlob`                   |
 * | `get` / `head`    | `GET` / `HEAD {blob}`                                          |
 * | `delete`          | `DELETE {blob}`                                                |
 * | `list`            | `GET {container}?restype=container&comp=list`, XML, `NextMarker` |
 * | `signedUrl`       | Service SAS: HMAC-SHA256 over a fixed 12-field string-to-sign  |
 *
 * Two differences worth knowing before anyone builds it, because they are the ones that
 * would change calling code rather than just this file:
 *
 * 1. **A SAS `PUT` still needs a header.** Azure requires `x-ms-blob-type: BlockBlob` on
 *    a block-blob write even under a SAS. That is why `SignedUrl` carries a `headers`
 *    map rather than being a bare string — S3 never populates it, and this is the
 *    provider that would.
 * 2. **Blocks, above 256 MiB.** A single `PUT` tops out there, and snapit's recordings
 *    reach 560 MB. A real implementation needs Put Block / Put Block List, which means
 *    `signedUrl` for an upload is not one URL. That is the first thing in this interface
 *    that Azure would genuinely strain, and the honest fix is a `createUpload()` that
 *    returns a provider-shaped multipart plan — S3 needs the same thing above 5 GB.
 */
export const createAzureProvider = (_config: AzureConfig): StorageProvider =>
  unimplementedProvider(
    'azure',
    'It needs Service SAS signing (HMAC-SHA256 over the 12-field string-to-sign) and, for ' +
      'recordings above 256 MiB, Put Block / Put Block List. See the notes in src/storage/azure.ts.'
  )
