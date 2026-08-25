import { useEffect, useState, type ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Icon, type IconName } from '@renderer/components/Icon'
import { humanDuration, metaLine, timeLabel } from './format'
import {
  at,
  body,
  finding,
  findings,
  iconButton,
  meta as metaStyle,
  name as nameStyle,
  row,
  rowActions,
  rowMain,
  thumb,
  thumbBadge,
  thumbFallback,
  thumbImage
} from './styles'

const FALLBACK_ICON: Record<LibraryEntry['kind'], IconName> = {
  screenshot: 'image',
  recording: 'film',
  session: 'globe'
}

/**
 * One capture in the list.
 *
 * A shell holding one button for the capture and one per action, rather than a single
 * row-wide button with the actions inside it: nesting them would be invalid markup and
 * would put them out of reach of a keyboard, which is most of the point of having them.
 */
export function CaptureRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onDeleted
}: {
  entry: LibraryEntry
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onDeleted: () => void
}): ReactElement {
  const [preview, setPreview] = useState<string | null>(null)

  // Per row rather than with the list: a thumbnail goes through the OS thumbnail
  // service, and waiting on forty of those would hold up the window painting at all.
  useEffect(() => {
    const source = entry.mediaPath
    if (!source) return
    let live = true
    void window.snapit.captureThumbnail(source).then((url) => {
      if (live) setPreview(url)
    })
    return () => {
      live = false
    }
  }, [entry.mediaPath])

  const duration = humanDuration(entry.durationMs)

  return (
    <li style={row(selected)} data-row data-selected={selected}>
      <button
        type="button"
        style={rowMain}
        onClick={onSelect}
        onDoubleClick={onOpen}
        aria-current={selected || undefined}
      >
        <span style={thumb}>
          {preview ? (
            <img src={preview} alt="" style={thumbImage} />
          ) : (
            <span style={thumbFallback}>
              <Icon name={FALLBACK_ICON[entry.kind]} />
              {entry.kind === 'session' && 'No video'}
            </span>
          )}
          {/* Only over a real frame: on an empty tile it collides with the fallback and
            duplicates the duration the line below already carries. */}
          {preview && duration && <span style={thumbBadge}>{duration}</span>}
        </span>

        <span style={body}>
          <span style={nameStyle}>{entry.name}</span>
          <span style={metaStyle}>{metaLine(entry)}</span>
          {(entry.consoleErrors > 0 || entry.failedRequests > 0) && (
            <span style={findings}>
              {entry.consoleErrors > 0 && (
                <span style={finding}>
                  {entry.consoleErrors} console error{entry.consoleErrors === 1 ? '' : 's'}
                </span>
              )}
              {entry.failedRequests > 0 && (
                <span style={finding}>
                  {entry.failedRequests} failed request{entry.failedRequests === 1 ? '' : 's'}
                </span>
              )}
            </span>
          )}
        </span>

        <span style={at}>{timeLabel(entry.capturedAt)}</span>
      </button>

      <span style={rowActions}>
        <RowAction
          icon="folder"
          label="Show in Finder"
          onClick={() => window.snapit.revealCapture(entry.path)}
        />
        {entry.kind === 'screenshot' && (
          <RowAction
            icon="pen"
            label="Edit this screenshot"
            onClick={() => void window.snapit.editCapture(entry.path)}
          />
        )}
        {entry.reportPath && (
          <RowAction
            icon="clipboard"
            label="Copy as Markdown"
            title="Copy as Markdown, ready to paste into a ticket"
            onClick={() => void window.snapit.copyCaptureMarkdown(entry.path)}
          />
        )}
        <RowAction
          icon="trash"
          label="Move to Trash"
          danger
          onClick={() => {
            void window.snapit.deleteCapture(entry.path, entry.name).then((gone) => {
              if (gone) onDeleted()
            })
          }}
        />
      </span>
    </li>
  )
}

function RowAction({
  icon,
  label,
  title,
  danger,
  onClick
}: {
  icon: IconName
  label: string
  title?: string
  danger?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      style={iconButton(danger)}
      title={title ?? label}
      aria-label={label}
      data-action
      data-danger={danger}
      onClick={onClick}
    >
      <Icon name={icon} size={15} />
    </button>
  )
}
