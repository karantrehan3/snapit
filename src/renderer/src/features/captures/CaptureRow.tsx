import type { CSSProperties, ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Findings } from '@renderer/components/Findings'
import { Icon, type IconName } from '@renderer/components/Icon'
import { humanDuration, metaLine, timeLabel } from '@renderer/lib/capture'
import { useThumbnail } from '@renderer/lib/useThumbnail'
import { at, body, name as nameStyle, meta as metaStyle, row, rowMain, thumb } from './styles'

/**
 * One capture, wherever a capture is listed.
 *
 * There were two of these — one in the capture list and one in the Overview's Recent
 * section — and they agreed about everything that matters and differed on paddings. Both
 * are this, at different thumbnail sizes.
 *
 * The severity edge is the point of the row. What went wrong is said twice at two
 * distances: a red left edge readable without reading, so scrolling finds the broken
 * captures, and counts beside it for once you have stopped on one.
 */

const FALLBACK_ICON: Record<LibraryEntry['kind'], IconName> = {
  screenshot: 'image',
  recording: 'film',
  session: 'globe'
}

export type ThumbSize = 'none' | 'small' | 'large'

const THUMB: Record<Exclude<ThumbSize, 'none'>, { w: number; h: number; icon: number }> = {
  small: { w: 76, h: 46, icon: 15 },
  large: { w: 132, h: 78, icon: 20 }
}

export function CaptureRow({
  entry,
  selected = false,
  thumbSize = 'small',
  compactFindings = false,
  onSelect,
  onOpen
}: {
  entry: LibraryEntry
  selected?: boolean
  thumbSize?: ThumbSize
  /** One total instead of two counts, for a row that only points at a capture. */
  compactFindings?: boolean
  onSelect: () => void
  /** Externally, in a real browser. Selecting is what shows it in the app. */
  onOpen?: () => void
}): ReactElement {
  const hasFindings = entry.consoleErrors > 0 || entry.failedRequests > 0

  return (
    <li style={row(selected, hasFindings)} data-row data-selected={selected}>
      <button
        type="button"
        style={rowMain}
        onClick={onSelect}
        onDoubleClick={onOpen}
        aria-current={selected || undefined}
      >
        {thumbSize !== 'none' && <Thumb entry={entry} size={thumbSize} />}

        <span style={body}>
          <span style={nameStyle}>{entry.name}</span>
          <span style={metaStyle}>{metaLine(entry)}</span>
          <Findings
            consoleErrors={entry.consoleErrors}
            failedRequests={entry.failedRequests}
            compact={compactFindings}
          />
        </span>

        <span style={at}>{timeLabel(entry.capturedAt)}</span>
      </button>
    </li>
  )
}

/**
 * The capture's own pixels, on a mat.
 *
 * The duration is burnt into the corner the way a video library does it, and only over a
 * real frame — on an empty tile it collides with the fallback icon and repeats what the
 * line below already says.
 */
export function Thumb({
  entry,
  size
}: {
  entry: LibraryEntry
  size: Exclude<ThumbSize, 'none'>
}): ReactElement {
  const preview = useThumbnail(entry.mediaPath)
  const box = THUMB[size]
  const duration = humanDuration(entry.durationMs)

  return (
    <span style={{ ...thumb, width: box.w, height: box.h }}>
      {preview ? (
        <img src={preview} alt="" style={thumbImage} />
      ) : (
        <span style={{ color: 'var(--on-mat-quiet)' }}>
          <Icon name={FALLBACK_ICON[entry.kind]} size={box.icon} />
        </span>
      )}
      {preview && duration && <span style={badge}>{duration}</span>}
    </span>
  )
}

const thumbImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block'
}

const badge: CSSProperties = {
  position: 'absolute',
  right: 3,
  bottom: 3,
  padding: '0 4px',
  borderRadius: 3,
  background: 'rgba(0, 0, 0, 0.72)',
  color: '#fff',
  font: '600 var(--t-micro) var(--mono)',
  fontVariantNumeric: 'tabular-nums'
}
