import { useEffect, useState } from 'react'

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

type HotkeyRecorder = { recording: boolean; held: string[]; start: () => void; stop: () => void }

/**
 * Click-to-record hotkey capture: while recording, tracks held modifiers live and
 * commits the first modifier+key combo as an Electron accelerator string. Esc
 * cancels and keeps the previous value.
 */
export function useHotkeyRecorder(onChange: (v: string) => void): HotkeyRecorder {
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
      const mods = heldModifiers(e)
      setHeld(mods)
      const key = acceleratorKey(e)
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

  return {
    recording,
    held,
    start: () => {
      setHeld([])
      setRecording(true)
    },
    stop: () => setRecording(false)
  }
}
