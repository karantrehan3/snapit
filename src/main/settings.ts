import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { app } from 'electron'

export type Settings = {
  screenshotHotkey: string
  recordHotkey: string
  gifHotkey: string
  saveDir: string
  /** Bearer token the local MCP server requires — generated once, never renderer-settable. */
  mcpToken: string
  /** Port the local MCP server listens on (127.0.0.1 only). */
  mcpPort: number
}

const DEFAULT_MCP_PORT = 47317

function defaults(): Settings {
  return {
    screenshotHotkey: 'CommandOrControl+Shift+9',
    recordHotkey: 'CommandOrControl+Shift+8',
    gifHotkey: 'CommandOrControl+Shift+7',
    saveDir: join(app.getPath('pictures'), 'snapit'),
    mcpToken: randomBytes(24).toString('hex'),
    mcpPort: DEFAULT_MCP_PORT
  }
}

let cache: Settings | null = null

const file = (): string => join(app.getPath('userData'), 'settings.json')

/** Validate persisted/incoming data field-by-field, falling back to defaults. */
function coerce(raw: unknown): Settings {
  const d = defaults()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  return {
    screenshotHotkey: typeof o.screenshotHotkey === 'string' ? o.screenshotHotkey : d.screenshotHotkey,
    recordHotkey: typeof o.recordHotkey === 'string' ? o.recordHotkey : d.recordHotkey,
    gifHotkey: typeof o.gifHotkey === 'string' ? o.gifHotkey : d.gifHotkey,
    saveDir: typeof o.saveDir === 'string' ? o.saveDir : d.saveDir,
    mcpToken: typeof o.mcpToken === 'string' && o.mcpToken.length > 0 ? o.mcpToken : d.mcpToken,
    mcpPort: typeof o.mcpPort === 'number' && Number.isInteger(o.mcpPort) ? o.mcpPort : d.mcpPort
  }
}

/** Keep only known string fields from an untrusted partial. */
function sanitize(partial: Partial<Settings>): Partial<Settings> {
  const o = (partial ?? {}) as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (typeof o.screenshotHotkey === 'string') out.screenshotHotkey = o.screenshotHotkey
  if (typeof o.recordHotkey === 'string') out.recordHotkey = o.recordHotkey
  if (typeof o.gifHotkey === 'string') out.gifHotkey = o.gifHotkey
  if (typeof o.saveDir === 'string') out.saveDir = o.saveDir
  return out
}

function persist(settings: Settings): void {
  try {
    writeFileSync(file(), JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error('[snapit] failed to write settings:', err)
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = existsSync(file()) ? coerce(JSON.parse(readFileSync(file(), 'utf-8'))) : defaults()
  } catch (err) {
    console.error('[snapit] failed to read settings, using defaults:', err)
    cache = defaults()
  }
  // Persist once per process on first load — this is what makes a freshly-generated
  // mcpToken (new install, or an old settings.json from before it existed) stable
  // across restarts instead of silently regenerating until something else writes it.
  persist(cache)
  return cache
}

export function setSettings(partial: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...sanitize(partial) }
  persist(cache)
  return cache
}

/** Replace the MCP bearer token — e.g. if it may have leaked. Not reachable via settings:set. */
export function regenerateMcpToken(): Settings {
  cache = { ...getSettings(), mcpToken: randomBytes(24).toString('hex') }
  persist(cache)
  return cache
}
