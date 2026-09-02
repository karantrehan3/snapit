import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { CaptureList } from './CaptureList'
import { CaptureDetail } from './CaptureDetail'
import { applyFilter, groupByDay, hasFindings, type Filter } from '@renderer/lib/capture'
import type { RouteProps } from '@renderer/features/shell/routes'
import { columns } from './styles'

/**
 * The Captures route: the list, and the capture.
 *
 * The list collapses. That is the one idea borrowed from the inspector-shaped
 * alternative, and it earns its keep: the report is the widest thing snapit renders — a
 * sortable table of four hundred requests plus a waterfall — and the shell already
 * spends 202px on the sidebar. Collapsed, the detail's header carries a switcher and
 * prev/next, so you can still move between captures without the list being on screen.
 *
 * Reviewing used to mean shelling out to the OS browser, so the app had no surface of
 * its own for the thing it exists to produce — you made a capture in snapit and then
 * read it in Chrome, which is to say you left at the moment the work got interesting.
 * Jam and Loom both put that surface at the front of the product; this is snapit's, with
 * none of the hosting: the list on the left, and beside it the capture itself, rendered
 * on open from the bundle on this machine.
 *
 * Selection is the whole interaction. Arrow keys move it, clicking moves it, and the
 * detail follows — so working through a folder of captures looking for the one with the
 * 500 in it is a held-down arrow key rather than forty round trips through a browser.
 * Enter and double-click still open the report externally, which is now an escape hatch
 * to a real browser's devtools rather than the only way to read anything.
 */
export function Captures({ focusCapture }: RouteProps): ReactElement {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(true)

  const load = useCallback(() => {
    void window.snapit.listLibrary().then(setEntries)
  }, [])

  useEffect(() => {
    load()
    // A capture written while this is open should appear, not wait for a reopen.
    return window.snapit.onLibraryChanged(load)
  }, [load])

  // Arrived here from a named capture elsewhere — the Overview's Recent list, or its
  // resume card. Clearing the filter too, or the capture asked for may not be in it.
  useEffect(() => {
    if (!focusCapture) return
    setFilter('all')
    setSelected(focusCapture)
  }, [focusCapture])

  const all = entries ?? []
  const shown = useMemo(() => applyFilter(all, filter), [all, filter])
  const groups = useMemo(() => groupByDay(shown), [shown])
  const index = useMemo(() => shown.findIndex((e) => e.path === selected), [shown, selected])
  const current = index === -1 ? null : shown[index]

  /** Move the selection by n, clamped. The arrow keys and the switcher share it. */
  const step = useCallback(
    (n: number) => {
      if (shown.length === 0) return
      const from = index === -1 ? 0 : index
      const next = Math.max(0, Math.min(shown.length - 1, index === -1 ? 0 : from + n))
      setSelected(shown[next].path)
    },
    [shown, index]
  )

  // A home that opens on nothing is a list again, so it opens on the newest capture.
  // Also covers the selected one being filtered out or deleted from under the detail.
  useEffect(() => {
    if (shown.length === 0) setSelected(null)
    else if (!shown.some((e) => e.path === selected)) setSelected(shown[0].path)
  }, [shown, selected])

  const openExternally = useCallback((entry: LibraryEntry) => {
    // The report in a real browser, with its devtools — the one thing the frame cannot
    // offer. A loose file has only itself to open.
    void window.snapit.openCapture(entry.reportPath ?? entry.mediaPath ?? entry.path)
  }, [])

  // Arrow keys move through the list, because a list you can only click is a list you
  // cannot work through. Ignored while the focus is inside the frame, which has its own
  // keyboard — the player's space bar and seek keys belong to it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (shown.length === 0) return
      if (document.activeElement?.tagName === 'IFRAME') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        step(e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'Enter' && index !== -1) {
        e.preventDefault()
        openExternally(shown[index])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shown, index, step, openExternally])

  const counts = {
    all: all.length,
    problems: all.filter(hasFindings).length,
    session: all.filter((e) => e.kind === 'session' || e.steps > 0).length
  }

  return (
    <div style={columns}>
      {listOpen && (
        <CaptureList
          groups={groups}
          loading={entries === null}
          total={all.length}
          counts={counts}
          filter={filter}
          selected={selected}
          onFilter={setFilter}
          onSelect={setSelected}
          onOpenExternally={openExternally}
        />
      )}
      <CaptureDetail
        entry={current}
        position={index === -1 ? null : { at: index + 1, of: shown.length }}
        listOpen={listOpen}
        onToggleList={() => setListOpen((open) => !open)}
        onStep={step}
        onDeleted={load}
        onRenamed={(next) => {
          // Follow it: the rename changed the identity the selection is keyed on, and
          // the re-listed folder will carry the new name.
          setSelected(next)
          load()
        }}
        onOpenExternally={openExternally}
      />
    </div>
  )
}
