import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ConfigError, loadConfig, type AppConfig } from './config.ts'
import { Router, sendError } from './http/router.ts'
import { notFound, sendJson } from './http/respond.ts'
import { handleLocalStorage, isLocalStoragePath } from './http/localStorageRoute.ts'
import { actorFrom } from './auth/context.ts'
import { createStorageProvider } from './storage/registry.ts'
import { createMemoryStore, type MemoryStore } from './store/memory.ts'
import { seedIfEmpty } from './seed.ts'
import {
  completeCapture,
  createCapture,
  deleteCapture,
  getCapture,
  listCaptures,
  type CaptureDeps
} from './api/captures.ts'
import { listMembers, removeMember, setCaptureSharing, setMember, whoami } from './api/workspaces.ts'
import { fileIntegration, listIntegrations, previewIntegration, setIntegration } from './api/integrations.ts'
import { viewCapture, viewData, viewMedia, viewReport } from './api/viewer.ts'
import type { StorageProvider } from './storage/provider.ts'

/**
 * The prototype server.
 *
 * Two surfaces, and they are authorised completely differently — which is the thing to
 * hold in mind while reading the route table:
 *
 * - `/v1/*` is the API. Every route resolves an `Actor` from a bearer token first, and
 *   the actor's workspace comes from inside that token. There is no middleware doing it
 *   implicitly; each handler is handed the actor, because a route that forgets should
 *   not compile.
 * - `/capture/:slug` is the viewer, and has no token at all. Its only credential is 128
 *   bits of slug, and every one of its handlers re-derives what may be shown rather than
 *   trusting the route it arrived on.
 *
 * See `README.md` for what this does and does not answer about ROADMAP M1.7.
 */

type Deps = CaptureDeps & { store: MemoryStore; storage: StorageProvider; publicUrl: string }
type Ctx = { deps: Deps; config: AppConfig }

function buildRouter(): Router<Ctx> {
  const router = new Router<Ctx>()
  const nowSeconds = (): number => Math.floor(Date.now() / 1000)

  /** Everything under `/v1` resolves an actor before it does anything else. */
  const authed =
    (
      handler: (
        req: IncomingMessage,
        res: ServerResponse,
        ctx: Ctx & { params: Record<string, string> },
        actor: ReturnType<typeof actorFrom>
      ) => Promise<void> | void
    ) =>
    async (req: IncomingMessage, res: ServerResponse, ctx: Ctx & { params: Record<string, string> }) => {
      const actor = actorFrom(req, ctx.config.tokenSecret, nowSeconds())
      await handler(req, res, ctx, actor)
    }

  router.get('/health', (_req, res, ctx) =>
    sendJson(res, 200, { ok: true, data: { storage: ctx.deps.storage.id, publicUrl: ctx.config.publicUrl } })
  )

  router.get(
    '/v1/me',
    authed((req, res, ctx, actor) => whoami(req, res, ctx.deps, actor))
  )

  router.get(
    '/v1/workspaces/:workspaceId/members',
    authed((req, res, ctx, actor) => listMembers(req, res, ctx.deps, actor, ctx.params.workspaceId!))
  )
  router.post(
    '/v1/workspaces/:workspaceId/members',
    authed((req, res, ctx, actor) => setMember(req, res, ctx.deps, actor, ctx.params.workspaceId!))
  )
  router.delete(
    '/v1/workspaces/:workspaceId/members/:userId',
    authed((req, res, ctx, actor) =>
      removeMember(req, res, ctx.deps, actor, ctx.params.workspaceId!, ctx.params.userId!)
    )
  )

  router.post(
    '/v1/workspaces/:workspaceId/captures',
    authed((req, res, ctx, actor) => createCapture(req, res, ctx.deps, actor, ctx.params.workspaceId!))
  )
  router.get(
    '/v1/workspaces/:workspaceId/captures',
    authed((req, res, ctx, actor) => listCaptures(req, res, ctx.deps, actor, ctx.params.workspaceId!))
  )
  router.post(
    '/v1/captures/:captureId/complete',
    authed((req, res, ctx, actor) => completeCapture(req, res, ctx.deps, actor, ctx.params.captureId!))
  )
  router.get(
    '/v1/captures/:captureId',
    authed((req, res, ctx, actor) => getCapture(req, res, ctx.deps, actor, ctx.params.captureId!))
  )
  router.delete(
    '/v1/captures/:captureId',
    authed((req, res, ctx, actor) => deleteCapture(req, res, ctx.deps, actor, ctx.params.captureId!))
  )
  router.post(
    '/v1/captures/:captureId/share',
    authed((req, res, ctx, actor) => setCaptureSharing(req, res, ctx.deps, actor, ctx.params.captureId!))
  )

  router.get(
    '/v1/workspaces/:workspaceId/integrations',
    authed((req, res, ctx, actor) => listIntegrations(req, res, ctx.deps, actor, ctx.params.workspaceId!))
  )
  router.post(
    '/v1/workspaces/:workspaceId/integrations/:kind',
    authed((req, res, ctx, actor) =>
      setIntegration(req, res, ctx.deps, actor, ctx.params.workspaceId!, ctx.params.kind!)
    )
  )
  router.post(
    '/v1/captures/:captureId/integrations/:kind/preview',
    authed((req, res, ctx, actor) =>
      previewIntegration(req, res, ctx.deps, actor, ctx.params.captureId!, ctx.params.kind!)
    )
  )
  router.post(
    '/v1/captures/:captureId/file',
    authed((req, res, ctx, actor) => fileIntegration(req, res, ctx.deps, actor, ctx.params.captureId!))
  )

  // The viewer. No `authed` wrapper anywhere below this line, deliberately visible.
  router.get('/capture/:slug', (req, res, ctx) => viewCapture(req, res, ctx.deps, ctx.params.slug!))
  router.get('/capture/:slug/report', (req, res, ctx) => viewReport(req, res, ctx.deps, ctx.params.slug!))
  router.get('/capture/:slug/media', (req, res, ctx) => viewMedia(req, res, ctx.deps, ctx.params.slug!))
  router.get('/capture/:slug/data/:name', (req, res, ctx) =>
    viewData(req, res, ctx.deps, ctx.params.slug!, ctx.params.name!)
  )

  return router
}

async function main(): Promise<void> {
  let config: AppConfig
  try {
    config = loadConfig()
  } catch (err) {
    console.error(`[snapit-server] configuration: ${err instanceof ConfigError ? err.message : String(err)}`)
    console.error('[snapit-server] see .env.example')
    process.exitCode = 1
    return
  }

  const storage = createStorageProvider(config)
  const store = await createMemoryStore(config.metadataFile)
  const deps: Deps = { store, storage, publicUrl: config.publicUrl }
  const router = buildRouter()

  // Prove storage works before accepting a capture. A bucket with the wrong policy
  // should stop the server, not surface as a broken share link tomorrow.
  try {
    await storage.preflight()
    console.log(`[snapit-server] storage "${storage.id}" verified: write, read, delete`)
  } catch (err) {
    console.error(`[snapit-server] storage "${storage.id}" is not usable:`)
    console.error(`  ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
    return
  }

  const seeded = await seedIfEmpty(store, config.tokenSecret)

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', config.publicUrl)
    const handle = async (): Promise<void> => {
      if (config.storage.provider === 'local' && isLocalStoragePath(url.pathname)) {
        await handleLocalStorage(req, res, url, storage, config.tokenSecret)
        return
      }
      const matched = router.match(req.method ?? 'GET', url.pathname)
      if (!matched) {
        const allowed = router.allowedMethods(url.pathname)
        if (allowed.length > 0) {
          res.writeHead(405, { allow: allowed.join(', ') }).end()
          return
        }
        throw notFound(`No route for ${req.method} ${url.pathname}.`)
      }
      await matched.handler(req, res, { deps, config, params: matched.params, url })
    }
    handle().catch((err) => sendError(res, err))
  })

  server.listen(config.port, () => {
    console.log(`[snapit-server] listening on ${config.publicUrl}`)
    if (seeded) {
      console.log(`[snapit-server] seeded workspace ${seeded.workspaceId}`)
      for (const [role, token] of Object.entries(seeded.tokens)) {
        console.log(`[snapit-server]   ${role.padEnd(9)} ${token}`)
      }
      console.log('[snapit-server] tokens expire in 24h and are printed once. See src/seed.ts.')
    }
  })
}

void main()
