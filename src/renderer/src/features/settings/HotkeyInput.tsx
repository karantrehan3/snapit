import type { ReactElement } from 'react'
import { useHotkeyRecorder } from './useHotkeyRecorder'
import { fieldStyle, hintStyle, keycapStyle } from './styles'

const MODIFIER_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧'
}

/** Render accelerator tokens as keycap chips, with mac symbols for modifiers. */
function Keycaps({ tokens, dim = false }: { tokens: string[]; dim?: boolean }): ReactElement {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {tokens.map((t, i) => (
        <kbd key={`${t}-${i}`} style={keycapStyle(dim)}>
          {MODIFIER_SYMBOLS[t] ?? t}
        </kbd>
      ))}
    </span>
  )
}

/** Click-to-record hotkey field with live keycap feedback. */
export function HotkeyInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): ReactElement {
  const { recording, held, start, stop } = useHotkeyRecorder(onChange)

  return (
    <button type="button" onClick={start} onBlur={stop} style={fieldStyle(recording)}>
      {recording ? (
        held.length ? (
          <Keycaps tokens={held} dim />
        ) : (
          <span style={hintStyle}>Press shortcut…</span>
        )
      ) : (
        <Keycaps tokens={value.split('+')} />
      )}
    </button>
  )
}
