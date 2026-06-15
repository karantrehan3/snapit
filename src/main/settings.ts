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
    screenshotHotkey: 'Cmd or Ctrl+Shift+9',
    recordHotkey: 'Cmd or Ctrl+Shift+8',
    saveDir: join(app.getPath('pictures'), 'snapit')
  }
}

let cache: Settings | null = null

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (cache) return cache
  let loaded: Settings
  try {
    loaded = existsSync(file()) ? { ...defaults(), ...JSON.parse(readFileSync(file(), 'utf-8')) } : defaults()
  } catch (err) {
    console.error('[snapit] failed to read settings, using defaults:', err)
    loaded = defaults()
  }
  cache = loaded
  return loaded
}

export function setSettings(partial: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...partial }
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error('[snapit] failed to write settings:', err)
  }
  return cache
}
