import type { Analytics } from './analytics'
import type { Marker } from './bundle'
import type { LibraryEntry } from './libraryEntry'
import type { IdentityMode } from './identity'

/**
 * Where snapit's captures come from.
 *
 * The second half of `ROADMAP.md` M3.0, and the reason it exists: today `library.ts`,
 * `analyticsSource.ts` and the IPC handlers each independently assume the save folder is
 * the truth. A connected mode bolted onto that produces a second path through every one
 * of them, and then a third when the first bug is found in only one.
 *
 * So every surface goes through this instead, and there are two implementations: one that
 * reads the folder (what ships, and what runs when nobody has signed in) and one that
 * talks to a snapit server. The renderer never learns which it got.
 *
 * ---
 *
 * **The decision this encodes: locally, the folder is the truth.** There is no local
 * metadata database, and adding one would be a mistake worth naming.
 *
 * A capture is a folder. People move them, rename them in Finder, drop them on a colleague
 * and delete them from the Trash — and today all of that works, because `listLibrary`
 * re-reads the directory and believes what it finds. An index that claimed otherwise would
 * be wrong within a week of ordinary use, and the failure would be a capture the app
 * insists exists and cannot open.
 *
 * The cost is that anything the folder cannot hold has nowhere to live locally. That has
 * not bitten yet because the things worth remembering — a capture's markers, its metadata —
 * are already written *into the bundle* (`markerStore.ts`), which is the same decision made
 * one level down. If local state ever appears that genuinely cannot go in a bundle, it
 * belongs in a cache that reconciles against the folder on startup, never in a store that
 * outranks it.
 *
 * Connected mode is the opposite and that is fine: there the server's database is the
 * truth, because there the bytes live in a bucket nobody is dragging around in Finder.
 */

/**
 * Opaque. Locally it is the capture's path; connected it is a capture id. Callers pass
 * back whatever `list()` handed them and never construct one — which is already how the
 * renderer behaves, since `LibraryEntry.path` has always been "the identity every action
 * takes".
 */
export type CaptureId = string

/** Where a capture can be opened, revealed or edited. */
export type CaptureLocation =
  | { kind: 'path'; path: string }
  /** A share link. Connected mode only — there is nothing on this disk to open. */
  | { kind: 'url'; url: string }

export interface CaptureStore {
  readonly mode: IdentityMode

  /** Newest first. Never throws for one bad capture — see `libraryEntry.ts`. */
  list(): Promise<LibraryEntry[]>

  /** Null when the platform cannot make one. Fetched per tile, not with the list. */
  thumbnail(id: CaptureId): Promise<string | null>

  /** One page of numbers across every capture. */
  analytics(): Promise<Analytics>

  /** Resolves to the capture's new id, or rejects with a reason a field can show. */
  rename(id: CaptureId, name: string): Promise<CaptureId>

  /** Returns what was stored, sanitised — the caller shows that, not what it sent. */
  setMarkers(id: CaptureId, markers: unknown): Promise<Marker[]>

  /** Irreversible from the app's point of view. Locally this is the Trash. */
  remove(id: CaptureId): Promise<void>

  /** Throws when the id is not one this store issued. */
  locate(id: CaptureId): Promise<CaptureLocation>
}
