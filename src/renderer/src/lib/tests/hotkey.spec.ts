import { describe, expect, it } from 'vitest'
import { hotkeyKeys, hotkeyLabel } from '../hotkey'

describe('hotkeyKeys', () => {
  it('turns an accelerator into the keys someone presses', () => {
    expect(hotkeyKeys('Command+Shift+9')).toEqual(['⌘', '⇧', '9'])
  })

  it('understands every spelling Electron accepts for the command key', () => {
    // `capturePrefs` writes `Command+…`; the defaults in `index.ts` use
    // `CommandOrControl+…`. Both have to read the same.
    for (const spelling of ['Command', 'CommandOrControl', 'CmdOrCtrl', 'Cmd', 'Super', 'Meta']) {
      expect(hotkeyKeys(`${spelling}+M`), spelling).toEqual(['⌘', 'M'])
    }
  })

  it('keeps a key it has no symbol for, rather than showing a blank cap', () => {
    expect(hotkeyKeys('Control+F5')).toEqual(['⌃', 'F5'])
    expect(hotkeyKeys('Alt+Space')).toEqual(['⌥', 'Space'])
  })

  it('survives the shapes a settings file can hold', () => {
    expect(hotkeyKeys('')).toEqual([])
    expect(hotkeyKeys('Command+')).toEqual(['⌘'])
    expect(hotkeyKeys(' Command + Shift + 9 ')).toEqual(['⌘', '⇧', '9'])
  })

  it('joins them for a tooltip, where caps cannot go', () => {
    expect(hotkeyLabel('Command+Shift+8')).toBe('⌘⇧8')
  })
})
