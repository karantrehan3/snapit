import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/router.ts'
import { badRequest, conflict, notFound, sendOk } from '../http/respond.ts'
import { requirePermission, requireWorkspace, type Actor } from '../auth/context.ts'
import { captureId as newCaptureId, shareSlug } from '../domain/ids.ts'
import { buildManifest, type ArtifactRecord } from '../domain/manifest.ts'
import { artifactKey, capturePrefix, requireFilename } from '../storage/keys.ts'
import type { Capture } from '../domain/model.ts'
import type { MetadataStore } from '../store/metadata.ts'
import type { StorageProvider } from '../storage/provider.ts'

/**
 * Captures: created in two phases, because of one number.
 *
 * A snapit recording is routinely 150 MB and a long one is 560 MB. If the desktop app
 * POSTed a capture to this server, the server would hold every byte of every customer's
 * QA environment in transit — the exact thing "customer-owned storage" is supposed to
 * avoid, and a bandwidth bill for data snapit does not want. So:
 *
 *   1. `POST /v1/workspaces/:id/captures` — the desktop declares what it has. The server
 *      records a `pending` capture and returns one presigned PUT per file.
 *   2. The desktop uploads **directly to the bucket**. Nothing passes through here.
 *   3. `POST /v1/captures/:id/complete` — the desktop says it finished. The server HEADs
 *      every object before believing it, then builds the manifest and marks it `ready`.
 *
 * Step 3's check is the part that is easy to skip and expensive to skip. Without it a
 * capture goes `ready` on the client's word, and a failed upload becomes a share link
 * that renders a broken player to whoever it was sent to.
 */

/** Long enough for a slow link to push a recording, short enough to be worth stealing briefly. */
const UPLOAD_WINDOW_SECONDS = 900

/** What the desktop declares in phase 1. */
type DeclaredFile = { name: string; role: ArtifactRecord['role']; bytes: number; contentType: string }

const ROLES: ReadonlyArray<ArtifactRecord['role']> = ['report', 'media', 'data']

/** 1 GB. Above this something is wrong, and a presigned PUT should not authorise it. */
const MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024

function declaredFiles(raw: unknown): DeclaredFile[] {
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
    if (typeof o.contentType !== 'string' || !o.contentType)
      throw badRequest(`files[${i}].contentType is required.`)
    // `requireFilename` throws a StorageError; restate it as a 400, because this one is
    // the client's fault and it should say so.
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
  const names = new Set(files.map((f) => f.name))
  if (names.size !== files.length) throw badRequest('Two files in this capture share a name.')
  return files
}

export type CaptureDeps = { store: MetadataStore; storage: StorageProvider; publicUrl: string }

export const shareUrlFor = (publicUrl: string, capture: Capture): string =>
  `${publicUrl}/capture/${capture.shareSlug}`

/** Phase 1. */
export async function createCapture(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  workspaceId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'capture:create')

  const body = (await readJson(req)) as Record<string, unknown>
  const title =
    typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled capture'
  const files = declaredFiles(body.files)

  const id = newCaptureId()
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
    createdAt: new Date().toISOString(),
    manifest: buildManifest({ meta: null, artifacts: [], fallbackCapturedAt: new Date().toISOString() })
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

  sendOk(res, { capture, uploads })
}

/** Phase 3. */
export async function completeCapture(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  id: string
): Promise<void> {
  requirePermission(actor, 'capture:create')
  const capture = await mine(deps, actor, id)
  if (capture.status === 'ready') throw conflict('That capture is already complete.')

  const body = (await readJson(req, 4_000_000)) as Record<string, unknown>
  const files = declaredFiles(body.files)

  // Believe the bucket, not the client. A file the client says it uploaded and the
  // bucket does not have is a broken share link waiting to be sent to somebody.
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
    manifest: buildManifest({ meta: body.meta, artifacts, fallbackCapturedAt: capture.createdAt })
  })

  sendOk(res, { capture: updated, shareUrl: shareUrlFor(deps.publicUrl, updated) })
}

export async function getCapture(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  id: string
): Promise<void> {
  requirePermission(actor, 'capture:read')
  const capture = await mine(deps, actor, id)
  const links = await deps.store.listIssueLinks(capture.id)
  sendOk(res, { capture, shareUrl: shareUrlFor(deps.publicUrl, capture), links })
}

export async function listCaptures(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  workspaceId: string
): Promise<void> {
  requireWorkspace(actor, workspaceId)
  requirePermission(actor, 'capture:read')
  const captures = await deps.store.listCaptures(workspaceId)
  sendOk(res, { captures }, { count: captures.length })
}

/**
 * Deleting removes the objects first and the record second.
 *
 * That order is deliberate and it is the safe one: a record without objects is a broken
 * capture somebody can see and delete again, while objects without a record are bytes
 * from a QA environment that nothing in the system knows about or will ever clean up.
 */
export async function deleteCapture(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: CaptureDeps,
  actor: Actor,
  id: string
): Promise<void> {
  requirePermission(actor, 'capture:delete')
  const capture = await mine(deps, actor, id)
  const prefix = capturePrefix(capture.orgId, capture.workspaceId, capture.id)
  for await (const object of deps.storage.list(prefix)) await deps.storage.delete(object.key)
  await deps.store.deleteCapture(capture.id)
  sendOk(res, { deleted: capture.id })
}

/** Load a capture and prove it belongs to the actor's workspace. */
export async function mine(deps: CaptureDeps, actor: Actor, id: string): Promise<Capture> {
  const capture = await deps.store.getCapture(id)
  // A capture in another workspace is reported as absent, not as forbidden: "403" on an
  // id you guessed confirms the id exists.
  if (!capture || capture.workspaceId !== actor.workspaceId) throw notFound(`No capture ${id}.`)
  return capture
}
