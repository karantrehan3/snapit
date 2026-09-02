import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { LibraryEntry } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Findings } from '@renderer/components/Findings'
import { Icon } from '@renderer/components/Icon'
import { KeyCap } from '@renderer/components/KeyCap'
import { Panel, panelBody } from '@renderer/components/Panel'
import { Stat, StatStrip } from '@renderer/components/StatStrip'
import { keyRow } from '@renderer/components/KeyCap'
import { captureActions, type CaptureAction } from './captureActions'
import { CaptureRow, Thumb } from '@renderer/features/captures/CaptureRow'
import { list } from '@renderer/features/captures/styles'
import { humanBytes, metaLine, relativeTime } from '@renderer/lib/capture'
import type { RouteProps } from './routes'
import { sectionHead, sectionMore, sectionTitle } from './styles'

/**
 * What you land on.
 *
 * The question when you open a background tool is not "which file" — it is "is this
 * thing working, and what just happened". snapit has one failure that makes every other
 * part of it look broken: without Screen Recording, macOS hands back black frames rather
 * than an error, so a capture comes out black with nothing to explain why. That belongs
 * on the surface you cannot avoid seeing, not behind a settings pane.
 *
 * Everything else here is the shortest path back to work: the capture you were last
 * looking at, and the handful before it.
 *
 * No big-number tiles. The counts are not the point of this page — the *state* is — and a
 * row of large figures would emphasise how many captures exist, which is a question
 * nobody has. Analytics is the page whose subject really is the figures, and it is the
 * one place they get the scale.
 */
export function Overview({ status, settings, go }: RouteProps): ReactElement {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null)

  const load = useCallback(() => {
    void window.snapit.listLibrary().then(setEntries)
  }, [])

  useEffect(() => {
    load()
    return window.snapit.onLibraryChanged(load)
  }, [load])

  const all = entries ?? []
  const [latest, ...rest] = all
  // Derived rather than asked for: every entry already carries its size, so a second
  // walk of the folder in the main process would be measuring what we are holding.
  const onDisk = all.reduce((n, e) => n + e.bytes, 0)
  // Assume granted until told otherwise, so the page does not flash a warning on open.
  const granted = status
    ? status.screenPermission === 'granted' || status.screenPermission === 'not-applicable'
    : true

  return (
    <>
      {/* The one thing that can make everything else look broken. It leads when it is
          wrong and is absent entirely when it is right. */}
      {!granted && (
        <Panel tone="warning" icon="alert" heading="snapit cannot see the screen">
          <p style={panelBody}>
            macOS will not let any application read the screen without Screen Recording, and it returns black
            frames rather than an error — so captures come out black with nothing to explain why.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" onClick={() => window.snapit.openScreenSettings()}>
              Open System Settings
            </Button>
            <Button onClick={() => go('settings')}>Settings</Button>
          </div>
        </Panel>
      )}

      {/* A capture tool's landing surface has to be able to start a capture. This
          shipped without one, with the four modes reachable only by hotkey or tray. */}
      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Start a capture</h2>
          <span style={sectionMore}>
            <Button variant="link" onClick={() => go('settings')}>
              Change the shortcuts
            </Button>
          </span>
        </div>
        {/* Four modes in the grid, and the file opener on its own row underneath. They
            are not the same kind of thing, and mixing them left an orphan cell that read
            as a layout accident. */}
        <div style={actionsRow}>
          {captureActions(settings)
            .filter((a) => !a.aside)
            .map((action) => (
              <CaptureButton key={action.key} action={action} />
            ))}
        </div>
        <div style={{ marginTop: 8 }}>
          {captureActions(settings)
            .filter((a) => a.aside)
            .map((action) => (
              <CaptureButton key={action.key} action={action} />
            ))}
        </div>
      </section>

      <StatStrip>
        <Stat
          label="Capturing"
          value={
            status?.sessionPhase === 'capturing'
              ? 'A web app, right now'
              : status?.sessionPhase === 'setup'
                ? 'Getting ready'
                : 'Nothing right now'
          }
        />
        <Stat label="Last capture" value={latest ? relativeTime(latest.capturedAt) : '—'} />
        <Stat label="Save folder" note={`${all.length} captures`}>
          <Button variant="link" icon="folder" onClick={() => window.snapit.openSaveFolder()}>
            {entries === null ? '—' : humanBytes(onDisk)}
          </Button>
        </Stat>
      </StatStrip>

      {latest ? (
        <section>
          <div style={sectionHead}>
            <h2 style={sectionTitle}>Pick up where you left off</h2>
          </div>
          <Resume entry={latest} onReview={() => go('captures', latest.path)} />
        </section>
      ) : (
        <Panel tone="neutral" heading="Nothing captured yet">
          <p style={panelBody}>
            Press <KeyCap>⌘</KeyCap> <KeyCap>⇧</KeyCap> <KeyCap>9</KeyCap> for a screenshot, or capture a web
            app to collect its console, network and steps alongside the recording.
          </p>
        </Panel>
      )}

      {rest.length > 0 && (
        <section>
          <div style={sectionHead}>
            <h2 style={sectionTitle}>Recent</h2>
            <span style={sectionMore}>
              <Button variant="link" onClick={() => go('captures')}>
                All {all.length} captures
              </Button>
            </span>
          </div>
          <ul style={{ ...list, borderTop: '1px solid var(--rule)' }}>
            {rest.slice(0, RECENT).map((entry) => (
              <CaptureRow
                key={entry.path}
                entry={entry}
                thumbSize="none"
                compactFindings
                onSelect={() => go('captures', entry.path)}
              />
            ))}
          </ul>
        </section>
      )}

      {status?.mcp.state === 'never' && (
        <div style={hint}>
          <Icon name="globe" size={14} />
          <span>
            <b style={{ color: 'var(--ink-2)' }}>Claude Code can read these captures.</b> Six tools over a
            local MCP server, so an agent sees the console error and the failed request without being told
            about them.
          </span>
          <span style={{ marginLeft: 'auto', flex: 'none' }}>
            <Button variant="link" onClick={() => go('claude')}>
              Set it up
            </Button>
          </span>
        </div>
      )}
    </>
  )
}

/** Enough to recognise the session you were in, not enough to become the Captures route. */
const RECENT = 4

/**
 * One capture mode, with what it gets you and the chord that does it without the app.
 *
 * The chord is shown rather than hidden in a tooltip because the hotkeys *are* snapit's
 * interface — someone who learns them here stops needing this page, which is the right
 * outcome for a background tool.
 */
function CaptureButton({ action }: { action: CaptureAction }): ReactElement {
  return (
    <button type="button" style={actionCard(action)} data-row onClick={action.run}>
      <span style={actionTop}>
        <Icon name={action.icon} size={16} />
        <span style={actionLabel}>{action.label}</span>
        {action.keys.length > 0 && (
          <span style={{ ...keyRow, marginLeft: 'auto' }}>
            {action.keys.map((k, i) => (
              <KeyCap key={`${k}-${i}`}>{k}</KeyCap>
            ))}
          </span>
        )}
      </span>
      <span style={actionHint}>{action.hint}</span>
    </button>
  )
}

/**
 * The one lifted thing on the page, because it is the one thing you probably came for.
 *
 * A border, a fill and a shadow each say "separate object", so they are spent here and
 * nowhere else on this page — the rows below it are rules.
 */
function Resume({ entry, onReview }: { entry: LibraryEntry; onReview: () => void }): ReactElement {
  return (
    <div style={resume}>
      <Thumb entry={entry} size="large" />
      <span style={copy}>
        <span style={name}>{entry.name}</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{metaLine(entry)}</span>
        <Findings consoleErrors={entry.consoleErrors} failedRequests={entry.failedRequests} />
      </span>
      <Button variant="primary" onClick={onReview}>
        Review
      </Button>
      <Button
        icon="external"
        label="Open in your browser"
        onClick={() => void window.snapit.openCapture(entry.reportPath ?? entry.mediaPath ?? entry.path)}
      />
    </div>
  )
}

/**
 * Two by two, so the four modes fill their rows.
 *
 * A narrower minimum gave three columns and left the fourth mode alone on a row of its
 * own, which reads as a layout accident rather than as a choice. Two also gives each
 * card room for its one-line description without it turning into four lines.
 */
const actionsRow: CSSProperties = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'
}

/**
 * The primary reads as the loud one, and the image opener as the quiet one, because they
 * are not the same kind of thing — four of these start a capture and one opens a file
 * that already exists.
 */
function actionCard(action: CaptureAction): CSSProperties {
  return {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: '11px 12px',
    borderRadius: 'var(--r-md)',
    border: `1px solid ${action.primary ? 'var(--focus)' : 'var(--surface-edge)'}`,
    background: action.primary ? 'var(--selected)' : 'var(--surface-raised)',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    // The file opener is quieter and full-width: adjacent to capturing, not one of them.
    ...(action.aside
      ? {
          background: 'transparent',
          borderStyle: 'dashed',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10
        }
      : {})
  }
}

const actionTop: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const actionLabel: CSSProperties = { fontSize: 'var(--t-body)', fontWeight: 600 }

const actionHint: CSSProperties = { color: 'var(--ink-3)', fontSize: 'var(--t-small)', lineHeight: 1.45 }

const resume: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 12,
  borderRadius: 'var(--r-lg)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 24px -18px rgba(0, 0, 0, 0.45)'
}

const copy: CSSProperties = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }

const name: CSSProperties = {
  font: '600 var(--t-body) var(--mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const hint: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 'var(--r-md)',
  border: '1px dashed var(--surface-edge)',
  color: 'var(--ink-3)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.5
}
