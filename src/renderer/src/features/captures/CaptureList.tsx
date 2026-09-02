import type { ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Chip } from '@renderer/components/Chip'
import { KeyCap } from '@renderer/components/KeyCap'
import { CaptureRow } from './CaptureRow'
import type { DayGroup, Filter } from '@renderer/lib/capture'
import {
  dayHeading,
  empty,
  emptyTitle,
  filters,
  footer,
  list,
  listHeader,
  listPane,
  scroller,
  title
} from './styles'

/**
 * The capture list: the half of the home window that stays put.
 *
 * A list rather than a grid of cards, because the question someone opens this to answer
 * is "which one was the bug", and that is read down a column of findings — a uniform
 * grid makes you hunt. Days are sticky headers so a long scroll never loses its place.
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
  onOpenExternally
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
}): ReactElement {
  const shown = groups.reduce((n, g) => n + g.entries.length, 0)

  return (
    <div style={listPane}>
      <header style={listHeader}>
        <h1 style={title}>Captures</h1>
        <div style={filters}>
          <FilterChip id="all" active={filter} onPick={onFilter} count={counts.all}>
            All
          </FilterChip>
          <FilterChip id="problems" active={filter} onPick={onFilter} count={counts.problems}>
            Problems
          </FilterChip>
          <FilterChip id="session" active={filter} onPick={onFilter} count={counts.session}>
            Web
          </FilterChip>
        </div>
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

function FilterChip({
  id,
  active,
  count,
  onPick,
  children
}: {
  id: Filter
  active: Filter
  count: number
  onPick: (f: Filter) => void
  children: string
}): ReactElement {
  return (
    <Chip selected={active === id} count={count} onClick={() => onPick(id)}>
      {children}
    </Chip>
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
