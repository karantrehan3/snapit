import type { ReactElement } from 'react'
import { KeyCap, keyRow } from '@renderer/components/KeyCap'
import { hotkeyKeys } from '@renderer/lib/hotkey'
import { useHotkeyRecorder } from './useHotkeyRecorder'
import { fieldStyle, hintStyle } from './styles'

/** Render accelerator tokens as keycap chips. Symbols come from `lib/hotkey.ts`. */
function Keycaps({ tokens, held = false }: { tokens: string[]; held?: boolean }): ReactElement {
  return (
    <span style={{ ...keyRow, gap: 4 }}>
      {hotkeyKeys(tokens.join('+')).map((t, i) => (
        <KeyCap key={`${t}-${i}`} held={held}>
          {t}
        </KeyCap>
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
          <Keycaps tokens={held} held />
        ) : (
          <span style={hintStyle}>Press shortcut…</span>
        )
      ) : (
        <Keycaps tokens={value.split('+')} />
      )}
    </button>
  )
}
