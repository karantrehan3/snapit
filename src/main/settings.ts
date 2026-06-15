import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { app } from 'electron'

export type Settings = {
  screenshotHotkey: string
  recordHotkey: string
  saveDir: string
}

function defaults(): Settings {
  return {
    screenshotHotkey: 'CommandOrControl+Shift+9',
    recordHotkey: 'CommandOrControl+Shift+8',
    saveDir: join(app.getPath('pictures'), 'snapit')
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
    saveDir: typeof o.saveDir === 'string' ? o.saveDir : d.saveDir
  }
}

/** Keep only known string fields from an untrusted partial. */
function sanitize(partial: Partial<Settings>): Partial<Settings> {
  const o = (partial ?? {}) as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (typeof o.screenshotHotkey === 'string') out.screenshotHotkey = o.screenshotHotkey
  if (typeof o.recordHotkey === 'string') out.recordHotkey = o.recordHotkey
  if (typeof o.saveDir === 'string') out.saveDir = o.saveDir
  return out
}

export function getSettings(): Settings {
  if (cache) return cache
  let loaded: Settings
  try {
    loaded = existsSync(file()) ? coerce(JSON.parse(readFileSync(file(), 'utf-8'))) : defaults()
  } catch (err) {
    console.error('[snapit] failed to read settings, using defaults:', err)
    loaded = defaults()
  }
  cache = loaded
  return loaded
}

export function setSettings(partial: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...sanitize(partial) }
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error('[snapit] failed to write settings:', err)
  }
  return cache
}
