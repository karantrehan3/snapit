import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'

const MODIFIER_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧'
}

/** Map a keyboard event to an Electron accelerator key token, or '' for a bare modifier. */
function acceleratorKey(e: KeyboardEvent): string {
  const k = e.key
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(k)) return ''
  if (k === ' ') return 'Space'
  if (k.startsWith('Arrow')) return k.replace('Arrow', '')
  if (k.length === 1) return k.toUpperCase()
  return k // F1–F12, Escape, Tab, etc.
}

/** The modifiers currently held, as Electron accelerator tokens. */
function heldModifiers(e: KeyboardEvent): string[] {
  const mods: string[] = []
  if (e.metaKey) mods.push('Command')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return mods
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

/**
 * Click-to-record hotkey field. Click → press a combo (at least one modifier + a
 * key) → builds an Electron accelerator string. While recording, held modifiers
 * show live as keycaps; Esc cancels and keeps the previous value.
 */
export function HotkeyInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): ReactElement {
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<string[]>([])

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      setHeld(heldModifiers(e))
      const key = acceleratorKey(e)
      const mods = heldModifiers(e)
      if (!key || mods.length === 0) return // need at least one modifier + a key
      onChange([...mods, key].join('+'))
      setRecording(false)
    }
    const onKeyUp = (e: KeyboardEvent): void => setHeld(heldModifiers(e))
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [recording, onChange])

  const start = (): void => {
    setHeld([])
    setRecording(true)
  }

  return (
    <button type="button" onClick={start} onBlur={() => setRecording(false)} style={fieldStyle(recording)}>
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

function fieldStyle(recording: boolean): CSSProperties {
  return {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${recording ? '#0a84ff' : '#c7c7cc'}`,
    background: recording ? '#eef6ff' : '#fff',
    boxShadow: recording ? '0 0 0 3px rgba(10, 132, 255, 0.15)' : 'none',
    cursor: 'pointer'
  }
}

function keycapStyle(dim: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 22,
    height: 24,
    padding: '0 7px',
    borderRadius: 5,
    background: dim ? '#dce8fb' : '#f2f2f4',
    border: '1px solid #d0d0d4',
    boxShadow: '0 1px 0 #d0d0d4',
    color: '#1c1c1e',
    font: '13px -apple-system, system-ui, sans-serif',
    fontWeight: 600
  }
}

const hintStyle: CSSProperties = {
  color: '#8e8e93',
  font: '13px -apple-system, system-ui, sans-serif'
}
