import { StorageError, type StorageProvider, type StorageProviderId } from './provider.ts'

/**
 * A provider that is shaped but not built.
 *
 * Deliberately not an empty file and not a silent fallback to local. The value of a
 * prototype's unbuilt branch is that it says precisely what building it costs, and that
 * it fails at configuration rather than at the first upload — a team that sets
 * `SNAPIT_STORAGE_PROVIDER=azure` should find out in the boot log, not from a QA lead
 * whose capture vanished.
 *
 * `preflight()` is what enforces that: `index.ts` calls it before listening, so an
 * unimplemented provider stops the server with the note below.
 */
export function unimplementedProvider(id: StorageProviderId, note: string): StorageProvider {
  const refuse = (): never => {
    throw new StorageError(
      'unsupported',
      `Storage provider "${id}" is not implemented in this prototype. ${note}`
    )
  }
  return {
    id,
    preflight: async () => refuse(),
    put: async () => refuse(),
    get: async () => refuse(),
    head: async () => refuse(),
    delete: async () => refuse(),
    // Refuses before yielding; the empty generator body is deliberate.
    list: async function* () {
      refuse()
    },
    signedUrl: async () => refuse()
  }
}
