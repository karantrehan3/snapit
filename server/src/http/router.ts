import type { IncomingMessage, ServerResponse } from 'node:http'
import { badRequest, sendError } from './respond.ts'

/**
 * A router, in eighty lines, because the alternative is a framework.
 *
 * Patterns are `/v1/workspaces/:workspaceId/captures` and match one segment per `:name`.
 * No wildcards, no regex routes, no middleware stack — every handler receives the same
 * explicit context and does its own authorisation, which is the property worth having
 * when the thing being authorised is somebody's QA recordings. A middleware that
 * *sometimes* applies is how a route ends up unprotected.
 */

export type Params = Record<string, string>

export type Handler<Ctx> = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: Ctx & { params: Params; url: URL }
) => Promise<void> | void

type Route<Ctx> = { method: string; segments: string[]; handler: Handler<Ctx> }

export class Router<Ctx> {
  private readonly routes: Route<Ctx>[] = []

  add(method: string, pattern: string, handler: Handler<Ctx>): this {
    this.routes.push({ method, segments: split(pattern), handler })
    return this
  }

  get = (pattern: string, handler: Handler<Ctx>): this => this.add('GET', pattern, handler)
  post = (pattern: string, handler: Handler<Ctx>): this => this.add('POST', pattern, handler)
  patch = (pattern: string, handler: Handler<Ctx>): this => this.add('PATCH', pattern, handler)
  delete = (pattern: string, handler: Handler<Ctx>): this => this.add('DELETE', pattern, handler)

  match(method: string, pathname: string): { handler: Handler<Ctx>; params: Params } | null {
    const actual = split(pathname)
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== actual.length) continue
      const params = matchSegments(route.segments, actual)
      if (params) return { handler: route.handler, params }
    }
    return null
  }

  /** Whether a path exists under another method — the difference between 404 and 405. */
  allowedMethods(pathname: string): string[] {
    const actual = split(pathname)
    return [
      ...new Set(
        this.routes
          .filter((r) => r.segments.length === actual.length && matchSegments(r.segments, actual))
          .map((r) => r.method)
      )
    ]
  }
}

const split = (path: string): string[] => path.split('/').filter((s) => s.length > 0)

function matchSegments(pattern: string[], actual: string[]): Params | null {
  const params: Params = {}
  for (const [i, expected] of pattern.entries()) {
    const got = actual[i]!
    if (expected!.startsWith(':')) {
      // An empty segment cannot be a parameter — `/captures//report` must not resolve.
      if (got.length === 0) return null
      params[expected!.slice(1)] = decodeURIComponent(got)
    } else if (expected !== got) {
      return null
    }
  }
  return params
}

/** Read and parse a JSON body, with a cap. */
export async function readJson(req: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > maxBytes) throw badRequest(`Request body is larger than ${maxBytes} bytes.`)
    chunks.push(chunk as Buffer)
  }
  if (total === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    throw badRequest('Request body is not valid JSON.')
  }
}

export { sendError }
