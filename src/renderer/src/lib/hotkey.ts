/**
 * An accelerator, as the keys a person would press.
 *
 * Electron stores hotkeys as `Command+Shift+9`, which is what `globalShortcut` wants and
 * not what anybody reads. This turns one into `['⌘', '⇧', '9']` so a `KeyCap` row can
 * show the real chord rather than a hard-coded one — which matters because the hotkeys
 * are editable, and a capture button teaching the wrong shortcut is worse than teaching
 * none.
 *
 * Lived inside `HotkeyInput` until the capture actions needed the same thing.
 */

/** macOS symbols, since that is the platform snapit is developed and tested on. */
const MODIFIER_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Meta: '⌘'
}

/**
 * Split on `+`, and leave anything unrecognised alone.
 *
 * An accelerator can name a key snapit has no symbol for — `F5`, `Space`, `Plus` — and
 * the readable answer there is the word itself, not a blank cap.
 */
export function hotkeyKeys(accelerator: string): string[] {
  return accelerator
    .split('+')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => MODIFIER_SYMBOLS[token] ?? token)
}

/** The same chord as one string, for a `title` attribute where caps cannot go. */
export const hotkeyLabel = (accelerator: string): string => hotkeyKeys(accelerator).join('')
