import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * A row of facts, divided rather than boxed.
 *
 * One bordered surface split by rules, not four cards: four cards would say these are
 * four separate objects, and they are one reading of one thing. It also keeps the
 * emphasis where it belongs — these are context for the page, not its subject, so
 * nothing here is set at hero scale.
 *
 * Two of these existed before this file, in the Overview and in Analytics, with
 * different paddings and different label sizes.
 */
export function StatStrip({ children }: { children: ReactNode }): ReactElement {
  return <div style={strip}>{children}</div>
}

export function Stat({
  label,
  value,
  note,
  tone = 'plain',
  /** Rendered instead of the value, for a value that is a control. */
  children
}: {
  label: string
  value?: string
  note?: string
  /** `bad` for a count nobody wants to be non-zero. */
  tone?: 'plain' | 'bad'
  children?: ReactNode
}): ReactElement {
  return (
    <div style={cell}>
      <span style={labelStyle}>{label}</span>
      {children ?? (
        <span style={{ ...valueStyle, ...(tone === 'bad' ? { color: 'var(--danger-ink)' } : {}) }}>
          {value}
        </span>
      )}
      {note && <span style={noteStyle}>{note}</span>}
    </div>
  )
}

/**
 * The same strip, with figures set larger.
 *
 * Analytics is the one page whose subject *is* the figures, so it is the one place they
 * get the scale. Everywhere else a stat is context and stays at reading size.
 */
export function StatFigure(props: Parameters<typeof Stat>[0]): ReactElement {
  return (
    <div style={cell}>
      <span style={labelStyle}>{props.label}</span>
      <span style={{ ...figureStyle, ...(props.tone === 'bad' ? { color: 'var(--danger-ink)' } : {}) }}>
        {props.value}
      </span>
      {props.note && <span style={noteStyle}>{props.note}</span>}
    </div>
  )
}

const strip: CSSProperties = {
  display: 'flex',
  border: '1px solid var(--surface-edge)',
  borderRadius: 'var(--r-lg)',
  background: 'var(--surface-raised)',
  overflow: 'hidden'
}

const cell: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '11px 14px',
  borderRight: '1px solid var(--rule)'
}

const labelStyle: CSSProperties = { color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }

const valueStyle: CSSProperties = {
  fontSize: 'var(--t-body)',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const figureStyle: CSSProperties = {
  font: '600 var(--t-figure) var(--mono)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em'
}

const noteStyle: CSSProperties = { color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }
