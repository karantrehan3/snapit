import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { CaptureRow } from './CaptureRow'
import { applyFilter, groupByDay, hasFindings, type Filter } from './format'
import {
  chip,
  chipCount,
  dayHeading,
  empty,
  emptyTitle,
  filters,
  footer,
  header,
  kbd,
  list,
  page,
  scroller,
  title
} from './styles'

/**
 * Where captures live.
 *
 * Everything snapit made was findable only in Finder, which shows a bundle as a folder
 * of JSON files and cannot say which one holds the 500. This is the same folder, read
 * the way the person who made those captures thinks about them: newest first, grouped
 * by day, with what went wrong on the face of each one.
 *
 * It also gives the per-capture actions somewhere to live. "Copy the last report" was a
 * tray item operating on an object nobody could see or choose; here it is a button on
 * the capture you are looking at.
 */
export function Library(): ReactElement {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.snapit.listLibrary().then(setEntries)
  }, [])

  useEffect(() => {
    load()
    // A capture written while this is open should appear, not wait for a reopen.
    return window.snapit.onLibraryChanged(load)
  }, [load])

  const all = entries ?? []
  const shown = useMemo(() => applyFilter(all, filter), [all, filter])
  const groups = useMemo(() => groupByDay(shown), [shown])

  const open = useCallback((entry: LibraryEntry) => {
    // The report is the thing worth opening when there is one: it holds the capture
    // and everything collected around it. A loose file has only itself.
    void window.snapit.openCapture(entry.reportPath ?? entry.mediaPath ?? entry.path)
  }, [])

  // Arrow keys move through the list and Enter opens, because a list you can only
  // click is a list you cannot work through.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (shown.length === 0) return
      const index = shown.findIndex((entry) => entry.path === selected)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = e.key === 'ArrowDown' ? index + 1 : index - 1
        const clamped = Math.max(0, Math.min(shown.length - 1, index === -1 ? 0 : next))
        setSelected(shown[clamped].path)
      } else if (e.key === 'Enter' && index !== -1) {
        e.preventDefault()
        open(shown[index])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shown, selected, open])

  const counts = {
    all: all.length,
    problems: all.filter(hasFindings).length,
    session: all.filter((e) => e.kind === 'session' || e.steps > 0).length
  }

  return (
    <div style={page}>
      <header style={header}>
        <h1 style={title}>Library</h1>
        <div style={filters}>
          <FilterChip id="all" active={filter} onPick={setFilter} count={counts.all}>
            All
          </FilterChip>
          <FilterChip id="problems" active={filter} onPick={setFilter} count={counts.problems}>
            With problems
          </FilterChip>
          <FilterChip id="session" active={filter} onPick={setFilter} count={counts.session}>
            Web sessions
          </FilterChip>
        </div>
      </header>

      <div style={scroller}>
        {entries === null ? null : shown.length === 0 ? (
          <Empty filtered={all.length > 0} onClear={() => setFilter('all')} />
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
                    onSelect={() => setSelected(entry.path)}
                    onOpen={() => open(entry)}
                    onDeleted={load}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <footer style={footer}>
        {shown.length > 0 && 'Double-click or press Enter to open · '}
        Captures are files on this machine; nothing here has left it.
      </footer>
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
    <button type="button" style={chip(active === id)} aria-pressed={active === id} onClick={() => onPick(id)}>
      {children}
      <span style={chipCount}>{count}</span>
    </button>
  )
}

/** Two different nothings: nothing captured yet, and nothing matching the filter. */
function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }): ReactElement {
  if (filtered) {
    return (
      <div style={empty}>
        <span style={emptyTitle}>Nothing matches that filter</span>
        <button type="button" style={chip(false)} onClick={onClear}>
          Show everything
        </button>
      </div>
    )
  }
  return (
    <div style={empty}>
      <span style={emptyTitle}>No captures yet</span>
      <span>
        Press <span style={kbd}>⌘⇧9</span> for a screenshot, <span style={kbd}>⌘⇧8</span> to record, or
        capture a web app from the tray to collect its console and network too.
      </span>
    </div>
  )
}
