import type { ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Findings } from '@renderer/components/Findings'
import { tileFacts, type DayGroup } from '@renderer/lib/capture'
import { Thumb } from './CaptureRow'
import {
  browseGrid,
  dayHeading,
  empty,
  emptyTitle,
  name as nameStyle,
  meta as metaStyle,
  scroller,
  tile,
  tileBody,
  tileFindings
} from './styles'
import { Button } from '@renderer/components/Button'

/**
 * The library as pictures.
 *
 * The row list is built for the question "which one was the bug", read down a column of
 * findings. That column has no room to show a capture, which is fine for a recording —
 * you are going to play it either way — and useless for a screenshot, where the picture
 * *is* the capture and a 76px sliver of it identifies nothing.
 *
 * So the same captures, at a size where you can recognise one. Days stay as headings,
 * because a folder of forty stills is otherwise a wall.
 *
 * Selecting from here switches to the reading view, rather than opening a detail beside
 * a grid: two levels of navigation on one screen would leave the tiles about 90px wide,
 * which is the size the row list already offers.
 */
export function CaptureGrid({
  groups,
  loading,
  total,
  selected,
  onSelect,
  onOpenExternally,
  onClearFilter
}: {
  groups: DayGroup[]
  loading: boolean
  /** Before filtering — "nothing captured" and "nothing matching" are different empties. */
  total: number
  selected: string | null
  onSelect: (path: string) => void
  onOpenExternally: (entry: LibraryEntry) => void
  onClearFilter: () => void
}): ReactElement {
  const shown = groups.reduce((n, g) => n + g.entries.length, 0)

  if (loading) return <div style={scroller} />

  if (shown === 0) {
    return (
      <div style={scroller}>
        <div style={empty}>
          <span style={emptyTitle}>{total > 0 ? 'Nothing matches that filter' : 'No captures yet'}</span>
          {total > 0 && <Button onClick={onClearFilter}>Show everything</Button>}
        </div>
      </div>
    )
  }

  return (
    <div style={scroller}>
      {groups.map((group) => (
        <section key={group.label}>
          <h2 style={{ ...dayHeading, padding: '14px 18px 6px' }}>{group.label}</h2>
          <ul style={browseGrid}>
            {group.entries.map((entry) => (
              <Tile
                key={entry.path}
                entry={entry}
                selected={entry.path === selected}
                onSelect={() => onSelect(entry.path)}
                onOpen={() => onOpenExternally(entry)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Tile({
  entry,
  selected,
  onSelect,
  onOpen
}: {
  entry: LibraryEntry
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}): ReactElement {
  const findings = entry.consoleErrors > 0 || entry.failedRequests > 0
  const facts = tileFacts(entry)

  return (
    <li>
      <button
        type="button"
        style={tile(selected)}
        data-row
        data-selected={selected}
        onClick={onSelect}
        onDoubleClick={onOpen}
        aria-current={selected || undefined}
      >
        <Thumb entry={entry} size="fill" />
        <span style={tileFindings(findings)} />
        <span style={tileBody}>
          <span style={nameStyle}>{entry.name}</span>
          {/* The kind is worth saying here in a way it is not in a row: a tile of a still
              and a tile of a recording look the same until one of them is playing. */}
          <span style={metaStyle}>{facts.what}</span>
          <span style={{ ...metaStyle, color: 'var(--ink-3)' }}>{facts.detail}</span>
          <Findings consoleErrors={entry.consoleErrors} failedRequests={entry.failedRequests} compact />
        </span>
      </button>
    </li>
  )
}
