import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import type { Marker } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Icon } from '@renderer/components/Icon'
import { markerTimeLabel } from '@renderer/features/record/markers'
import { errorMessage } from '@renderer/lib/errorMessage'
import { addMarkerAt, removeMarker, renameMarker, MAX_NOTE_CHARS } from './markerEdit'
import {
  markerBar,
  markerChip,
  markerEmpty,
  markerNote,
  markerNoteInput,
  markerProblem,
  markerTime,
  markerTrail
} from './styles'

/**
 * The markers of a saved capture, and the only place they can be changed.
 *
 * The pins are drawn inside the report, which is the right place for them — a share
 * carries the same page, so whoever you send it to sees the same marks on the same
 * timeline. But the report is framed in a sandbox with no shared origin and no preload,
 * deliberately, so nothing in it can edit anything. That is what this is: the editing
 * half, outside the frame, in the app that owns the file.
 *
 * The two halves talk over `postMessage`, which is the only channel a sandboxed frame
 * has. Two messages, both asked by this side: seek there, and where is the playhead. The
 * second is what makes "add" mean "add here" rather than "add at zero" — a marker you
 * then have to type a timestamp into is not worth the control.
 *
 * A recording that was made without markers is the common case, so this is not a panel:
 * it is one row that says what it is for, and grows chips as they are added.
 */
export function MarkerBar({
  path,
  markers,
  frame,
  onChanged
}: {
  path: string
  markers: Marker[]
  /** The framed report, which owns the player. */
  frame: RefObject<HTMLIFrameElement | null>
  /** Persisted markers came back from main; the frame needs re-rendering to redraw pins. */
  onChanged: (markers: Marker[]) => void
}): ReactElement {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  // Selecting a different capture must not carry an open editor or a stale complaint.
  useEffect(() => {
    setEditing(null)
    setProblem(null)
  }, [path])

  useEffect(() => {
    if (editing !== null) field.current?.focus()
  }, [editing])

  const post = (message: { snapit: 'seek' | 'where'; atSec?: number }): void => {
    // '*' rather than an origin: the frame's own origin is opaque by design, so there is
    // no origin to name. It is the only window this can reach.
    frame.current?.contentWindow?.postMessage(message, '*')
  }

  /**
   * Ask the player where it is.
   *
   * Resolves to null rather than hanging when nothing answers — the frame may be showing
   * a report whose media is missing, and a button that never returns is worse than one
   * that says why.
   */
  const playhead = (): Promise<number | null> =>
    new Promise((resolve) => {
      const target = frame.current?.contentWindow
      if (!target) return resolve(null)
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onMessage)
        resolve(null)
      }, 400)
      function onMessage(event: MessageEvent): void {
        // Only the frame we asked, and only the shape we asked for. Everything inside
        // that frame is somebody else's console output; the message is data, not a
        // command.
        if (event.source !== target) return
        const data = event.data as { snapit?: string; atSec?: unknown }
        if (data?.snapit !== 'at' || typeof data.atSec !== 'number') return
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve(data.atSec)
      }
      window.addEventListener('message', onMessage)
      post({ snapit: 'where' })
    })

  const save = async (next: Marker[]): Promise<void> => {
    try {
      onChanged(await window.snapit.setMarkers(path, next))
      setProblem(null)
    } catch (err) {
      setProblem(errorMessage(err))
    }
  }

  const add = async (): Promise<void> => {
    const atSec = await playhead()
    if (atSec === null) {
      setProblem('The player did not answer, so snapit does not know where to put it.')
      return
    }
    const edit = addMarkerAt(markers, atSec * 1000)
    if (edit.refused) {
      setProblem(edit.refused)
      return
    }
    await save(edit.markers)
  }

  const commitRename = async (index: number): Promise<void> => {
    const edit = renameMarker(markers, index, draft.trim())
    setEditing(null)
    if (edit.refused) {
      setProblem(edit.refused)
      return
    }
    await save(edit.markers)
  }

  const drop = async (index: number): Promise<void> => {
    const edit = removeMarker(markers, index)
    if (edit.refused) {
      setProblem(edit.refused)
      return
    }
    await save(edit.markers)
  }

  return (
    <div style={markerBar}>
      <span style={markerTrail}>
        <Icon name="flag" size={14} />
        {markers.length === 0 ? (
          <span style={markerEmpty}>No markers yet — add one wherever the recording is now.</span>
        ) : (
          markers.map((marker, index) =>
            editing === index ? (
              <input
                key={`edit-${marker.atMs}`}
                ref={field}
                value={draft}
                maxLength={MAX_NOTE_CHARS}
                aria-label={`Note for the marker at ${markerTimeLabel(marker.atMs)}`}
                placeholder="What happened here?"
                style={markerNoteInput}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitRename(index)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditing(null)
                  }
                }}
                onBlur={() => void commitRename(index)}
              />
            ) : (
              <span key={marker.atMs} style={markerChip}>
                {/* The timestamp seeks; the note is what you came to read. */}
                <button
                  type="button"
                  style={markerTime}
                  title="Play from here"
                  onClick={() => post({ snapit: 'seek', atSec: marker.atMs / 1000 })}
                >
                  {markerTimeLabel(marker.atMs)}
                </button>
                <button
                  type="button"
                  data-rename
                  style={{ ...markerNote, cursor: 'text' }}
                  title="Rename this marker"
                  onClick={() => {
                    setDraft(marker.note)
                    setEditing(index)
                  }}
                >
                  <span>{marker.note.trim() || 'Add a note'}</span>
                  <span data-pencil style={{ display: 'flex', color: 'var(--ink-3)' }}>
                    <Icon name="pen" size={12} />
                  </span>
                </button>
                <Button size="sm" icon="close" label="Delete this marker" onClick={() => void drop(index)} />
              </span>
            )
          )
        )}
      </span>

      {problem && <span style={markerProblem}>{problem}</span>}

      <Button size="sm" icon="plus" onClick={() => void add()} style={{ marginLeft: 'auto' }}>
        Marker here
      </Button>
    </div>
  )
}
