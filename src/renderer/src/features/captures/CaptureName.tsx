import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { Icon } from '@renderer/components/Icon'
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
      // The slot takes the header's spare width; the control takes only the name's, so
      // hovering the empty half of the header does not light up a rename target.
      <span style={wrap}>
        <button type="button" data-rename style={trigger} title="Rename this capture" onClick={start}>
          <span style={triggerName}>{name}</span>
          {/* The only thing that says this name is editable, and only while pointed at. */}
          <span data-pencil style={pencil}>
            <Icon name="pen" size={13} />
          </span>
        </button>
      </span>
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

/**
 * Looks like the text it replaces until it is hovered, so the header stays quiet.
 *
 * "Until it is hovered" is the whole affordance, and it lives in tokens.css under
 * `[data-rename]` — an inline style object cannot express a hover state, and a name that
 * is editable is indistinguishable from one that is not until something says so.
 */
const trigger: CSSProperties = {
  ...detailName,
  // Shrink to the name rather than filling the slot, so the hover is on the name.
  flex: '0 1 auto',
  maxWidth: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 6px',
  margin: '0 -6px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid transparent',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'text'
}

/** The name keeps the ellipsis; the pencil must not be what gets truncated. */
const triggerName: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const pencil: CSSProperties = { flex: 'none', display: 'flex', color: 'var(--ink-3)' }

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
