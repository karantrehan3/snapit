import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { Analytics as Data } from '@preload/index'
import { Icon } from '@renderer/components/Icon'
import { Panel, panelBody } from '@renderer/components/Panel'
import { StatFigure, StatStrip } from '@renderer/components/StatStrip'
import { errorMessage } from '@renderer/lib/errorMessage'
import { humanBytes } from '@renderer/lib/capture'
import { sectionHead, sectionTitle } from './styles'

/**
 * What every capture together says.
 *
 * The thing snapit can answer and DevTools cannot: DevTools has the session that is
 * open, snapit has all of them. So the headline is not how many captures exist — it is
 * **which endpoint has failed in more than one of them**, because one 500 is an event and
 * the same 500 across four sessions over three weeks is a bug nobody has filed.
 *
 * Local, and structurally so: `main/analytics.ts` is pure and imports nothing that could
 * reach the network. Nothing on this page is sent anywhere.
 */
export function Analytics(): ReactElement {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void window.snapit
      .readAnalytics()
      .then((next) => {
        if (live) setData(next)
      })
      .catch((err: unknown) => {
        if (live) setFailed(errorMessage(err))
      })
    return () => {
      live = false
    }
  }, [])

  if (failed !== null) {
    return (
      <Panel tone="danger" icon="alert" heading="Could not read the save folder">
        <p style={panelBody}>{failed}</p>
      </Panel>
    )
  }
  if (!data) return <span style={{ color: 'var(--ink-3)' }}>Reading captures…</span>

  if (data.captures === 0) {
    return (
      <Panel tone="neutral" heading="Nothing to compare yet">
        <p style={panelBody}>
          This page needs a few web sessions to say anything. It reads every capture in the save folder and
          looks for the same request failing in more than one of them — the pattern a single report cannot
          show you.
        </p>
      </Panel>
    )
  }

  return (
    <>
      {/* The one page whose subject really is the figures, so it is the one place they
          get the scale. */}
      <StatStrip>
        <StatFigure label="Captures" value={String(data.captures)} note={kindNote(data)} />
        <StatFigure
          label="Requests seen"
          value={data.requests.toLocaleString()}
          note={`${data.failedRequests} failed`}
          tone={data.failedRequests > 0 ? 'bad' : 'plain'}
        />
        <StatFigure
          label="Console errors"
          value={String(data.consoleErrors)}
          note={`${data.withFindings} captures with findings`}
          tone={data.consoleErrors > 0 ? 'bad' : 'plain'}
        />
        <StatFigure label="On disk" value={humanBytes(data.bytes)} note={rangeNote(data)} />
      </StatStrip>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Failing across captures</h2>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            ids and query strings collapsed, so one endpoint is one row
          </span>
        </div>
        {data.failingEndpoints.length === 0 ? (
          <p style={quiet}>Nothing has failed in any capture yet.</p>
        ) : (
          <div style={table}>
            {data.failingEndpoints.map((e) => (
              <div key={e.endpoint} style={row}>
                <span style={captureCount(e.captures > 1)}>
                  {e.captures}
                  <span style={captureWord}>{e.captures === 1 ? 'capture' : 'captures'}</span>
                </span>
                <span style={endpoint} title={e.endpoint}>
                  {e.endpoint}
                </span>
                <span style={statuses}>
                  {e.statuses.map((s) => (
                    <span key={s} style={statusPill}>
                      {s === 0 ? 'no reply' : s}
                    </span>
                  ))}
                </span>
                <span style={num}>{e.failures}×</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Slowest endpoints</h2>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            p95 of what was observed, three samples minimum
          </span>
        </div>
        {data.slowest.length === 0 ? (
          <p style={quiet}>Not enough repeated requests to compare yet.</p>
        ) : (
          <div style={table}>
            {data.slowest.map((s) => (
              <div key={s.endpoint} style={row}>
                <span style={{ ...num, width: 74, color: 'var(--ink)' }}>{ms(s.p95Ms)}</span>
                <span style={endpoint} title={s.endpoint}>
                  {s.endpoint}
                </span>
                <Bar value={s.p95Ms} max={data.slowest[0].p95Ms} />
                <span style={{ ...num, width: 66 }}>{ms(s.medianMs)} med</span>
                <span style={{ ...num, width: 34 }}>n={s.samples}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Last 30 days</h2>
        </div>
        <Days days={data.days} />
      </section>
    </>
  )
}

/** The split, so "55 captures" says what kind of thing those were. */
const kindNote = (d: Data): string =>
  [
    d.byKind.session > 0 ? `${d.byKind.session} web` : '',
    d.byKind.recording > 0 ? `${d.byKind.recording} recordings` : '',
    d.byKind.screenshot > 0 ? `${d.byKind.screenshot} screenshots` : ''
  ]
    .filter(Boolean)
    .join(' · ')

const rangeNote = (d: Data): string => {
  if (!d.firstCapturedAt) return ''
  const from = new Date(d.firstCapturedAt)
  return `since ${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`)

/** One scale for every bar, anchored on the slowest, so lengths are comparable. */
function Bar({ value, max }: { value: number; max: number }): ReactElement {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <span style={barTrack} aria-hidden="true">
      <span style={{ ...barFill, width: `${pct}%` }} />
    </span>
  )
}

/**
 * Captures per day, with the console errors of those days over them.
 *
 * Every day in the window has a column, including the empty ones — a gap is information
 * and a missing column is not the same shape as a zero one.
 */
function Days({ days }: { days: Data['days'] }): ReactElement {
  const peak = Math.max(1, ...days.map((d) => d.captures))
  return (
    <div style={chart}>
      <div style={chartRow}>
        {days.map((d) => {
          const h = Math.round((d.captures / peak) * 100)
          return (
            <span
              key={d.day}
              style={column}
              title={`${d.day} — ${d.captures} capture${d.captures === 1 ? '' : 's'}, ${d.errors} console error${d.errors === 1 ? '' : 's'}`}
            >
              <span
                style={{
                  ...columnFill,
                  height: `${h}%`,
                  background: d.errors > 0 ? 'var(--danger-ink)' : 'var(--focus)',
                  opacity: d.captures === 0 ? 0 : 1
                }}
              />
              {d.captures === 0 && <span style={columnEmpty} />}
            </span>
          )
        })}
      </div>
      <div style={chartAxis}>
        <span>{label(days[0]?.day)}</span>
        <span style={{ marginLeft: 'auto' }}>Today</span>
      </div>
      <div style={legend}>
        <span style={legendItem}>
          <span style={{ ...swatch, background: 'var(--focus)' }} />a clean day
        </span>
        <span style={legendItem}>
          <span style={{ ...swatch, background: 'var(--danger-ink)' }} />a day with console errors
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="folder" size={12} />
          read from this machine only
        </span>
      </div>
    </div>
  )
}

const label = (iso: string | undefined): string => {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const table: CSSProperties = { display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--rule)' }

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '7px 2px',
  borderBottom: '1px solid var(--rule)'
}

/** The number that matters, and it stops being quiet as soon as it is more than one. */
function captureCount(recurring: boolean): CSSProperties {
  return {
    flex: 'none',
    width: 78,
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 4,
    font: '600 var(--t-strong) var(--mono)',
    fontVariantNumeric: 'tabular-nums',
    color: recurring ? 'var(--danger-ink)' : 'var(--ink-2)'
  }
}

const captureWord: CSSProperties = { font: '400 var(--t-micro) var(--font)', color: 'var(--ink-3)' }

const endpoint: CSSProperties = {
  flex: 1,
  minWidth: 0,
  font: 'var(--t-small) var(--mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const statuses: CSSProperties = { flex: 'none', display: 'flex', gap: 4 }

const statusPill: CSSProperties = {
  padding: '0 6px',
  borderRadius: 'var(--r-pill)',
  border: '1px solid var(--danger-soft-edge)',
  background: 'var(--danger-soft)',
  color: 'var(--danger-ink)',
  font: '600 var(--t-micro) var(--mono)'
}

const num: CSSProperties = {
  flex: 'none',
  width: 44,
  textAlign: 'right',
  color: 'var(--ink-3)',
  font: 'var(--t-small) var(--mono)',
  fontVariantNumeric: 'tabular-nums'
}

const barTrack: CSSProperties = {
  flex: 'none',
  width: 120,
  height: 6,
  borderRadius: 3,
  background: 'var(--surface-sunken)',
  overflow: 'hidden'
}

const barFill: CSSProperties = { display: 'block', height: '100%', background: 'var(--warning)' }

const chart: CSSProperties = {
  padding: '14px 16px 12px',
  borderRadius: 'var(--r-lg)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8
}

const chartRow: CSSProperties = { display: 'flex', alignItems: 'flex-end', gap: 3, height: 92 }

const column: CSSProperties = {
  flex: 1,
  minWidth: 3,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  position: 'relative'
}

const columnFill: CSSProperties = { display: 'block', width: '100%', borderRadius: 2, minHeight: 3 }

/** A day with nothing still has a mark, so the axis reads as continuous. */
const columnEmpty: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 2,
  borderRadius: 2,
  background: 'var(--surface-edge)'
}

const chartAxis: CSSProperties = {
  display: 'flex',
  color: 'var(--ink-3)',
  font: 'var(--t-micro) var(--mono)'
}

const legend: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  paddingTop: 6,
  borderTop: '1px solid var(--rule)',
  color: 'var(--ink-3)',
  fontSize: 'var(--t-micro)'
}

const legendItem: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 }

const swatch: CSSProperties = { width: 8, height: 8, borderRadius: 2, display: 'block' }

const quiet: CSSProperties = { margin: 0, color: 'var(--ink-3)', fontSize: 'var(--t-small)' }
