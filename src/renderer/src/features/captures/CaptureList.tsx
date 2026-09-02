import type { ReactElement, ReactNode } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { KeyCap } from '@renderer/components/KeyCap'
import { CaptureFilters } from './CaptureFilters'
import { CaptureRow } from './CaptureRow'
import type { DayGroup, Filter } from '@renderer/lib/capture'
import { dayHeading, empty, emptyTitle, footer, list, listHeader, listPane, scroller, title } from './styles'

/**
 * The capture list: the half of the home window that stays put.
 *
 * A list rather than a grid, because the question someone opens this to answer is "which
 * one was the bug", and that is read down a column of findings — a uniform grid makes you
 * hunt. Days are sticky headers so a long scroll never loses its place.
 *
 * The grid it argues against exists too, as browse mode, and the argument still holds:
 * that view answers a different question ("which screenshot was it") which this one
 * cannot, because a row has no room to show a capture.
 *
 * The per-capture actions used to live on each row. They are on the detail beside it
 * now, which is a straight improvement: five icon buttons per row in a column this
 * narrow left no room for the name, and an action on the capture you are looking at
 * needs no aim.
 */
export function CaptureList({
  groups,
  loading,
  total,
  counts,
  filter,
  selected,
  onFilter,
  onSelect,
  onOpenExternally,
  viewToggle
}: {
  groups: DayGroup[]
  loading: boolean
  /** Before filtering — "nothing captured" and "nothing matching" are different empties. */
  total: number
  counts: Record<Filter, number>
  filter: Filter
  selected: string | null
  onFilter: (f: Filter) => void
  onSelect: (path: string) => void
  onOpenExternally: (entry: LibraryEntry) => void
  /** The rows/browse switch, owned by the route because both views wear it. */
  viewToggle?: ReactNode
}): ReactElement {
  const shown = groups.reduce((n, g) => n + g.entries.length, 0)

  return (
    <div style={listPane}>
      <header style={listHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={title}>Captures</h1>
          {viewToggle}
        </div>
        <CaptureFilters filter={filter} counts={counts} onFilter={onFilter} />
      </header>

      <div style={scroller}>
        {loading ? null : shown === 0 ? (
          <Empty filtered={total > 0} onClear={() => onFilter('all')} />
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h2 style={dayHeading}>{group.label}</h2>
              <ul style={list}>
                {group.entries.map((entry) => (
                  <CaptureRow
                    key={entry.path}
                    entry={entry}
                    selected={entry.path === selected}
                    onSelect={() => onSelect(entry.path)}
                    onOpen={() => onOpenExternally(entry)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <footer style={footer}>Captures are files on this machine; nothing here has left it.</footer>
    </div>
  )
}

/** Two different nothings: nothing captured yet, and nothing matching the filter. */
function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }): ReactElement {
  if (filtered) {
    return (
      <div style={empty}>
        <span style={emptyTitle}>Nothing matches that filter</span>
        <Button onClick={onClear}>Show everything</Button>
      </div>
    )
  }
  return (
    <div style={empty}>
      <span style={emptyTitle}>No captures yet</span>
      <span>
        Press <KeyCap>⌘⇧9</KeyCap> for a screenshot, <KeyCap>⌘⇧8</KeyCap> to record, or capture a web app from
        the tray to collect its console and network too.
      </span>
    </div>
  )
}
