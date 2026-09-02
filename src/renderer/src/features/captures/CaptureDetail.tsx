import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { CaptureView, LibraryEntry, Marker } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Icon } from '@renderer/components/Icon'
import { Panel, panelBody } from '@renderer/components/Panel'
import { errorMessage } from '@renderer/lib/errorMessage'
import { CaptureName } from './CaptureName'
import { MarkerBar } from './MarkerBar'
import {
  detailActions,
  detailBody,
  detailHead,
  detailPane,
  frame,
  mediaHolder,
  mediaImage,
  mediaVideo,
  nothing,
  nothingTitle,
  switcher,
  switcherCount
} from './styles'

/**
 * The capture, beside the list.
 *
 * The report is framed rather than rebuilt in React, and that is the decision this
 * component exists to express. Rebuilding it would mean two renderers for one thing —
 * the player, the timeline, the console, the sortable Network table with its detail
 * tabs — kept in step by hand, and diverging the first time either one is improved. The
 * frame cannot diverge: what is in it is what a share would send, because it comes from
 * the same `renderReport` call.
 *
 * The trade is that the app cannot put its own controls around the player, because the
 * player is inside the frame. That is a real cost and it buys the thing that matters
 * more here — a timestamp in the timeline seeks a video that is still on screen, which
 * is the report's whole layout and would need a message bridge to survive being split
 * across the boundary. `STATUS.md` records the decision.
 *
 * ## The sandbox
 *
 * A report is arbitrary text from another application: console output, request URLs,
 * response headers, error bodies. It is escaped, and it used to only ever open in an
 * external browser — this is the first time it renders anywhere near `window.snapit`.
 *
 * `sandbox="allow-scripts"`, and nothing else:
 *
 * - **`allow-scripts` is granted** because the Network panel's sorting, filtering and
 *   detail tabs are a script, as is seeking the player from a timestamp. Without it the
 *   table still renders — every row's sort keys and filter text are in the markup and
 *   every detail pane is rendered shut in the page — but it stops being usable.
 * - **`allow-same-origin` is withheld**, which is the important one. With both tokens a
 *   frame is same-origin with its embedder and can reach into it — and can remove its
 *   own sandbox attribute and reload itself out of the sandbox entirely. Without it the
 *   frame's origin is opaque: no parent DOM, no `window.snapit`.
 * - **`allow-forms`, `allow-modals`, `allow-popups`, `allow-top-navigation` and
 *   `allow-downloads` are withheld** because the report has no forms, opens nothing and
 *   navigates nowhere. Its only links are same-document fragments — `#requests`,
 *   `#console`, and the `:target` tabs — which need no token.
 *
 * Two things hold this up from outside. The frame gets no preload, because Electron only
 * runs one in subframes with `nodeIntegrationInSubFrames`, which is off. And the report
 * is served under `default-src 'none'` with no `connect-src` at all (see
 * `main/captureUrl.ts`), so a script that did get in has nowhere to send what it found.
 */
export function CaptureDetail({
  entry,
  position,
  listOpen,
  onToggleList,
  onStep,
  onDeleted,
  onRenamed,
  onOpenExternally
}: {
  entry: LibraryEntry | null
  /** Where this capture sits in the filtered list, for the switcher. */
  position: { at: number; of: number } | null
  listOpen: boolean
  onToggleList: () => void
  onStep: (n: number) => void
  onDeleted: () => void
  /** Renaming changes a capture's path, so the list has to re-read and re-select. */
  onRenamed: (newPath: string) => void
  onOpenExternally: (entry: LibraryEntry) => void
}): ReactElement {
  const [view, setView] = useState<CaptureView | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  /**
   * Markers are held here rather than read from `view`, because they change: editing one
   * writes meta.json and hands back what was stored, and the pins inside the frame are
   * drawn from that same file. Bumping `redraw` re-keys the frame, which re-requests the
   * report — it is rendered per request — so the rail matches the editor above it.
   */
  const [markers, setMarkers] = useState<Marker[]>([])
  const [redraw, setRedraw] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setView(null)
    setFailed(null)
    setMarkers([])
    if (!entry) return
    let live = true
    void window.snapit
      .viewCapture(entry.path)
      .then((next) => {
        if (!live) return
        setView(next)
        setMarkers(next.kind === 'report' ? next.markers : [])
      })
      .catch((err: unknown) => {
        if (live) setFailed(errorMessage(err))
      })
    return () => {
      live = false
    }
  }, [entry?.path])

  if (!entry) {
    return (
      <div style={detailPane}>
        <div style={nothing}>
          <Icon name="film" size={26} />
          <span style={nothingTitle}>Nothing selected</span>
          <span>Pick a capture on the left to watch it and read what was collected around it.</span>
        </div>
      </div>
    )
  }

  return (
    <div style={detailPane}>
      {/* The report below carries the title, the date, the duration, the filename and
          the counts. This carries what it cannot: which capture, and what you can do. */}
      <header style={detailHead}>
        <Button
          size="sm"
          icon="sidebar"
          label={listOpen ? 'Hide the list' : 'Show the list'}
          onClick={onToggleList}
        />

        {/* With the list hidden this is the only way to move between captures, so it is
            always here rather than appearing when it is needed. */}
        <span style={switcher}>
          <Button
            size="sm"
            variant="ghost"
            icon="chevron-left"
            label="Previous capture"
            disabled={!position || position.at <= 1}
            onClick={() => onStep(-1)}
          />
          <span style={switcherCount}>{position ? `${position.at} of ${position.of}` : '—'}</span>
          <Button
            size="sm"
            variant="ghost"
            icon="chevron-right"
            label="Next capture"
            disabled={!position || position.at >= position.of}
            onClick={() => onStep(1)}
          />
        </span>

        <CaptureName path={entry.path} name={entry.name} onRenamed={onRenamed} />

        <div style={detailActions}>
          <Button
            size="sm"
            icon="folder"
            label="Show in Finder"
            onClick={() => window.snapit.revealCapture(entry.path)}
          />
          {entry.kind === 'screenshot' && (
            <Button
              size="sm"
              icon="pen"
              label="Edit this screenshot"
              onClick={() => void window.snapit.editCapture(entry.path)}
            />
          )}
          {/* Both act on the report, so both are here only when there is one. */}
          {entry.reportPath && (
            <>
              <Button
                size="sm"
                icon="clipboard"
                label="Copy as Markdown"
                title="Copy as Markdown, ready to paste into a ticket"
                onClick={() => void window.snapit.copyCaptureMarkdown(entry.path)}
              />
              <Button
                size="sm"
                icon="share"
                label="Share"
                title="Save one .html anyone can open — no snapit, no folder, no network"
                onClick={() => void window.snapit.shareCapture(entry.path)}
              />
            </>
          )}
          <Button
            size="sm"
            icon="external"
            label="Open in your browser"
            title="Open the report in your browser, where its devtools are"
            onClick={() => onOpenExternally(entry)}
          />
          <Button
            size="sm"
            icon="trash"
            label="Move to Trash"
            danger
            onClick={() => {
              void window.snapit.deleteCapture(entry.path, entry.name).then((gone) => {
                if (gone) onDeleted()
              })
            }}
          />
        </div>
      </header>

      {/* Only where a marker can point at something: a still has no timeline, and a
          bundle with no readable metadata has no file to write them to. */}
      {view?.kind === 'report' && view.seekable && (
        <MarkerBar
          path={entry.path}
          markers={markers}
          frame={frameRef}
          onChanged={(next) => {
            setMarkers(next)
            setRedraw((n) => n + 1)
          }}
        />
      )}

      <div style={detailBody}>
        {failed !== null ? (
          <Panel tone="danger" icon="alert" heading="This capture could not be opened" style={{ margin: 18 }}>
            <p style={panelBody}>{failed}</p>
            <p style={{ ...panelBody, marginTop: 10 }}>
              It is still on disk. Show it in Finder to see what is left of it.
            </p>
          </Panel>
        ) : view === null ? null : view.kind === 'report' ? (
          // key on the URL so switching captures replaces the document rather than
          // navigating it, which would otherwise keep the previous one's scroll and tab.
          <iframe
            ref={frameRef}
            key={`${view.url}#${redraw}`}
            src={view.url}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title={`Report for ${entry.name}`}
            style={frame}
          />
        ) : (
          <div style={mediaHolder}>
            {view.media === 'video' ? (
              <video key={view.url} src={view.url} style={mediaVideo} controls preload="metadata" />
            ) : (
              <img key={view.url} src={view.url} alt={entry.name} style={mediaImage} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
