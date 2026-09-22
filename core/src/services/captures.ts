import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { badRequest, conflict, notFound } from '../errors.ts'
import { captureId as newCaptureId, shareSlug } from '../domain/ids.ts'
import { buildManifest, type ArtifactRecord } from '../domain/manifest.ts'
import { artifactKey, capturePrefix, requireFilename } from '../storage/keys.ts'
import type { Capture, IssueLink } from '../domain/model.ts'
import type { MetadataStore } from '../store/metadata.ts'
import type { SignedUrl, StorageProvider } from '../storage/provider.ts'

/**
 * Captures, as functions rather than as HTTP.
 *
 * Nothing here takes a request or writes a response, and that is the whole point: the
 * desktop app calls these directly, in its own process, and an on-prem deployment calls
 * the same functions behind the router in `server/`. One implementation of "what a capture
 * is and who may touch it", two transports — which is the only way the two modes cannot
 * drift apart.
 *
 * **Authorisation lives here, not in the transport.** That is deliberate and it is the
 * property worth protecting through any later refactor: a check that sits in a middleware
 * is a check the in-process caller skips, and the in-process caller is the desktop app.
 *
 * Created in two phases, because of one number. A snapit recording is routinely 150 MB and
 * a long one is 560 MB, so the bytes must never pass through whatever is orchestrating
 * this: `create` hands back presigned PUTs, the client uploads directly to storage, and
 * `complete` re-checks every object against the bucket before believing any of it.
 */

/** Long enough for a slow link to push a recording, short enough to be worth stealing briefly. */
const UPLOAD_WINDOW_SECONDS = 900

/** 1 GB. Above this something is wrong, and a presigned PUT should not authorise it. */
const MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024

const ROLES: ReadonlyArray<ArtifactRecord['role']> = ['report', 'media', 'data']

export type CaptureDeps = {
  store: MetadataStore
  storage: StorageProvider
  /** How the outside world addresses this deployment. Locally, the app's own scheme. */
  publicUrl: string
}

export type DeclaredFile = {
  name: string
  role: ArtifactRecord['role']
  bytes: number
  contentType: string
}

export const shareUrlFor = (publicUrl: string, capture: Capture): string =>
  `${publicUrl}/capture/${capture.shareSlug}`

/**
 * Validate what a client says it has.
 *
 * Exported because both phases check the same shape, and because the in-process caller
 * should get the same refusals as an HTTP one rather than a different set.
 */
export function declaredFiles(raw: unknown): DeclaredFile[] {
  if (!Array.isArray(raw) || raw.length === 0) throw badRequest('`files` must be a non-empty array.')
  if (raw.length > 32) throw badRequest('A capture may declare at most 32 files.')

  const files = raw.map((entry, i) => {
    const o = (entry ?? {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : ''
    const role = o.role as ArtifactRecord['role']
    const bytes = typeof o.bytes === 'number' ? o.bytes : NaN
    if (!ROLES.includes(role)) throw badRequest(`files[${i}].role must be one of ${ROLES.join(', ')}.`)
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > MAX_ARTIFACT_BYTES) {
      throw badRequest(`files[${i}].bytes must be between 0 and ${MAX_ARTIFACT_BYTES}.`)
    }
    if (typeof o.contentType !== 'string' || !o.contentType) {
      throw badRequest(`files[${i}].contentType is required.`)
    }
    // `requireFilename` throws a StorageError; restate it as a 400, because this one is the
    // caller's fault and should say so.
    try {
      requireFilename(name)
    } catch {
      throw badRequest(`files[${i}].name is not a usable filename: ${JSON.stringify(name)}`)
    }
    return { name, role, bytes, contentType: o.contentType }
  })

  if (files.filter((f) => f.role === 'media').length > 1) {
    throw badRequest('A capture has at most one media file.')
  }
  if (new Set(files.map((f) => f.name)).size !== files.length) {
    throw badRequest('Two files in this capture share a name.')
  }
  return files
}

export type CreateCaptureInput = { title?: unknown; files: unknown }
export type Upload = { name: string; role: ArtifactRecord['role']; key: string } & SignedUrl
export type CreatedCapture = { capture: Capture; uploads: Upload[] }

/** Phase 1: record a `pending` capture and mint one upload URL per declared file. */
export async function createCapture(
  deps: CaptureDeps,
  actor: Actor,
  workspaceId: string,
  input: CreateCaptureInput
): Promise<CreatedCapture> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'capture:create')

  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim().slice(0, 200)
      : 'Untitled capture'
  const files = declaredFiles(input.files)

  const id = newCaptureId()
  const now = new Date().toISOString()
  const capture: Capture = {
    id,
    workspaceId,
    orgId: actor.orgId,
    shareSlug: shareSlug(),
    title,
    status: 'pending',
    visibility: 'workspace',
    linkRevokedAt: null,
    uploadedBy: actor.userId,
    createdAt: now,
    manifest: buildManifest({ meta: null, artifacts: [], fallbackCapturedAt: now })
  }
  await deps.store.createCapture(capture)

  const uploads = await Promise.all(
    files.map(async (file) => {
      const key = artifactKey({
        orgId: actor.orgId,
        workspaceId,
        captureId: id,
        role: file.role,
        filename: file.name
      })
      const signed = await deps.storage.signedUrl(key, {
        expiresInSeconds: UPLOAD_WINDOW_SECONDS,
        method: 'PUT'
      })
      return { name: file.name, role: file.role, key, ...signed }
    })
  )

  return { capture, uploads }
}

export type CompleteCaptureInput = { files: unknown; meta?: unknown }

/**
 * Phase 3: believe the bucket, not the client.
 *
 * A file the client says it uploaded and the bucket does not have is a broken share link
 * waiting to be sent to somebody, so every object is re-checked before the capture is
 * marked ready.
 */
export async function completeCapture(
  deps: CaptureDeps,
  actor: Actor,
  id: string,
  input: CompleteCaptureInput
): Promise<{ capture: Capture; shareUrl: string }> {
  requirePermission(actor, 'capture:create')
  const capture = await mine(deps, actor, id)
  if (capture.status === 'ready') throw conflict('That capture is already complete.')

  const files = declaredFiles(input.files)

  const found = await Promise.all(
    files.map(async (file) => {
      const key = artifactKey({
        orgId: capture.orgId,
        workspaceId: capture.workspaceId,
        captureId: capture.id,
        role: file.role,
        filename: file.name
      })
      const object = await deps.storage.head(key)
      return object ? { ...file, bytes: object.bytes } : { ...file, missing: true as const }
    })
  )
  const missing = found.filter((f) => 'missing' in f)
  if (missing.length > 0) {
    await deps.store.updateCapture(capture.id, { status: 'failed' })
    throw badRequest(`These files never reached storage: ${missing.map((f) => f.name).join(', ')}.`)
  }

  const artifacts: ArtifactRecord[] = found.map((f) => ({
    name: f.name,
    role: f.role,
    bytes: f.bytes,
    contentType: f.contentType
  }))
  const updated = await deps.store.updateCapture(capture.id, {
    status: 'ready',
    manifest: buildManifest({ meta: input.meta, artifacts, fallbackCapturedAt: capture.createdAt })
  })

  return { capture: updated, shareUrl: shareUrlFor(deps.publicUrl, updated) }
}

export async function getCapture(
  deps: CaptureDeps,
  actor: Actor,
  id: string
): Promise<{ capture: Capture; shareUrl: string; links: IssueLink[] }> {
  requirePermission(actor, 'capture:read')
  const capture = await mine(deps, actor, id)
  return {
    capture,
    shareUrl: shareUrlFor(deps.publicUrl, capture),
    links: await deps.store.listIssueLinks(capture.id)
  }
}

/**
 * Rename a capture.
 *
 * `capture:create` rather than a read, and rather than a permission of its own: renaming is
 * how a capture gets the title a ticket will quote, so whoever may produce one may title
 * it. A `viewer` may not.
 */
export async function renameCapture(
  deps: CaptureDeps,
  actor: Actor,
  id: string,
  title: unknown
): Promise<Capture> {
  requirePermission(actor, 'capture:create')
  const capture = await mine(deps, actor, id)
  const next = typeof title === 'string' ? title.trim() : ''
  if (!next) throw badRequest('A capture needs a name.')
  return deps.store.updateCapture(capture.id, { title: next.slice(0, 200) })
}

export async function listCaptures(deps: CaptureDeps, actor: Actor, workspaceId: string): Promise<Capture[]> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'capture:read')
  return deps.store.listCaptures(workspaceId)
}

/**
 * Objects first, record second.
 *
 * A record without objects is a broken capture somebody can see and delete again. Objects
 * without a record are bytes from a QA environment that nothing in the system knows about
 * or will ever clean up.
 */
export async function deleteCapture(deps: CaptureDeps, actor: Actor, id: string): Promise<string> {
  requirePermission(actor, 'capture:delete')
  const capture = await mine(deps, actor, id)
  const prefix = capturePrefix(capture.orgId, capture.workspaceId, capture.id)
  for await (const object of deps.storage.list(prefix)) await deps.storage.delete(object.key)
  await deps.store.deleteCapture(capture.id)
  return capture.id
}

/**
 * Load a capture and prove it belongs to the actor's workspace.
 *
 * A capture in another workspace is reported absent rather than forbidden: a 403 on an id
 * you guessed confirms the id exists.
 */
export async function mine(deps: CaptureDeps, actor: Actor, id: string): Promise<Capture> {
  const capture = await deps.store.getCapture(id)
  if (!capture || capture.workspaceId !== actor.workspaceId) throw notFound(`No capture ${id}.`)
  return capture
}
