import { randomUUID } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getSettings } from '../settings'
import { extractBearerToken, tokensMatch, isAllowedHost, isAllowedOrigin } from './auth'
import { registerCaptureTools, type CaptureHooks } from './tools'
import { registerSessionTools, type SessionHooks } from './sessionTools'

/**
 * Local-only MCP server exposing snapit's screenshot tools to an MCP client
 * (e.g. `claude mcp add --transport http`). Bound to 127.0.0.1 only, gated by a
 * per-install bearer token (see settings.ts) — the client's own per-tool-call
 * prompt is the rest of the consent model, deliberately not duplicated here.
 *
 * One MCP session = one McpServer + one StreamableHTTPServerTransport pair,
 * keyed by the `Mcp-Session-Id` the SDK generates on initialize (McpServer.connect
 * takes ownership of a transport, so distinct sessions can't share one instance).
 */

const MCP_PATH = '/mcp'
const LOOPBACK_HOST = '127.0.0.1'

const mcpUrl = (port: number): string => `http://${LOOPBACK_HOST}:${port}${MCP_PATH}`

type Session = { server: McpServer; transport: StreamableHTTPServerTransport }

/** Everything the MCP tools need from the main process. */
export type McpHooks = CaptureHooks & SessionHooks

let httpServer: Server | null = null
const sessions = new Map<string, Session>()

function isAuthorized(req: IncomingMessage): boolean {
  const token = extractBearerToken(req.headers.authorization)
  return token !== null && tokensMatch(token, getSettings().mcpToken)
}

function closeAllSessions(): void {
  for (const { transport } of sessions.values()) void transport.close()
  sessions.clear()
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

function createSession(appVersion: string, hooks: McpHooks): Session {
  const server = new McpServer({ name: 'snapit', version: appVersion })
  registerCaptureTools(server, hooks)
  registerSessionTools(server, hooks)
  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (id) => {
      sessions.set(id, { server, transport })
    }
  })
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId)
  }
  void server.connect(transport)
  return { server, transport }
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  appVersion: string,
  hooks: McpHooks
): Promise<void> {
  const headerSessionId = req.headers['mcp-session-id']
  const sessionId = typeof headerSessionId === 'string' ? headerSessionId : undefined
  const existing = sessionId ? sessions.get(sessionId) : undefined
  if (existing) {
    await existing.transport.handleRequest(req, res)
    return
  }
  // No known session: only a POST can legitimately start one (the initialize
  // call). A GET/DELETE with no matching session has nothing to attach to.
  if (req.method !== 'POST') {
    sendJsonRpcError(res, 400, 'No active MCP session for this request.')
    return
  }
  const { transport } = createSession(appVersion, hooks)
  await transport.handleRequest(req, res)
}

/** Start the local MCP server (no-op if already running). */
export function startMcpServer(appVersion: string, hooks: McpHooks): void {
  if (httpServer) return
  const { mcpPort } = getSettings()
  httpServer = createServer((req, res) => {
    if (!req.url || new URL(req.url, 'http://localhost').pathname !== MCP_PATH) {
      res.writeHead(404).end()
      return
    }
    if (!isAllowedHost(req.headers.host, mcpPort) || !isAllowedOrigin(req.headers.origin, mcpPort)) {
      res.writeHead(403).end()
      return
    }
    if (!isAuthorized(req)) {
      sendJsonRpcError(res, 401, 'Unauthorized — missing or invalid bearer token.')
      return
    }
    handleMcpRequest(req, res, appVersion, hooks).catch((err) => {
      console.error('[snapit] MCP request failed:', err)
      if (!res.headersSent) sendJsonRpcError(res, 500, 'Internal error')
    })
  })
  httpServer.on('error', (err) => console.error('[snapit] MCP server error:', err))
  httpServer.listen(mcpPort, LOOPBACK_HOST, () => {
    console.log(`[snapit] MCP server listening on ${mcpUrl(mcpPort)}`)
  })
}

/** Stop the local MCP server and close all sessions. */
export function stopMcpServer(): void {
  closeAllSessions()
  httpServer?.close()
  httpServer = null
}

/** Disconnect all connected MCP clients without stopping the server — used after token rotation. */
export function disconnectAllSessions(): void {
  closeAllSessions()
}

/** The `claude mcp add` command to paste into a terminal, with this install's token baked in. */
export function mcpSetupCommand(): string {
  const { mcpPort, mcpToken } = getSettings()
  return `claude mcp add --transport http snapit ${mcpUrl(mcpPort)} --header "Authorization: Bearer ${mcpToken}"`
}
