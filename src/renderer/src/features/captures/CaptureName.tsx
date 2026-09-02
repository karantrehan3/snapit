import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { errorMessage } from '@renderer/lib/errorMessage'
import { detailName } from './styles'

/**
 * The capture's name, which is also its folder on disk.
 *
 * Editable in place rather than behind a dialog: a name is one field, and a modal for
 * one field is a modal too many. Click it, type, Enter commits and Escape puts it back.
 *
 * The validation lives in the main process (`captureName.ts`) and is not repeated here.
 * That is deliberate — two validators drift, and the one that matters is the one next to
 * the filesystem. So this submits and shows whatever came back, which is a sentence
 * naming the rule that was broken rather than "invalid name".
 */
export function CaptureName({
  path,
  name,
  onRenamed
}: {
  path: string
  name: string
  /** The new path, since renaming a capture changes its identity. */
  onRenamed: (newPath: string) => void
}): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  // Selecting a different capture while this is open must not carry the draft over.
  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [path])

  const start = (): void => {
    setDraft(name)
    setError(null)
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    const input = field.current
    input?.focus()
    // Everything but the extension, which is not the user's to change anyway.
    const dot = draft.lastIndexOf('.')
    input?.setSelectionRange(0, dot > 0 ? dot : draft.length)
  }, [editing])

  const commit = async (): Promise<void> => {
    if (draft.trim() === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      onRenamed(await window.snapit.renameCapture(path, draft))
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button type="button" style={trigger} title="Rename this capture" onClick={start}>
        {name}
      </button>
    )
  }

  return (
    <span style={wrap}>
      <input
        ref={field}
        value={draft}
        disabled={saving}
        aria-label="Capture name"
        aria-invalid={error !== null}
        style={{ ...input, ...(error ? { borderColor: 'var(--danger-ink)' } : {}) }}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
            setError(null)
          }
        }}
        // Clicking away is a commit, the way Finder treats a rename.
        onBlur={() => void commit()}
      />
      {error && <span style={problem}>{error}</span>}
    </span>
  )
}

/** Looks like the text it replaces until it is hovered, so the header stays quiet. */
const trigger: CSSProperties = {
  ...detailName,
  padding: '2px 6px',
  margin: '0 -6px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid transparent',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'text'
}

const wrap: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  height: 26,
  padding: '0 6px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--focus)',
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
  font: '400 var(--t-body) var(--mono)'
}

const problem: CSSProperties = {
  flex: 'none',
  color: 'var(--danger-ink)',
  fontSize: 'var(--t-small)'
}
