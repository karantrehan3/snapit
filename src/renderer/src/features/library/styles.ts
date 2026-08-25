import type { CSSProperties } from 'react'

/**
 * The library window.
 *
 * A list rather than a grid of cards, because the question someone opens this to answer
 * is "which one was the bug", and that is read down a column of findings — a uniform
 * grid makes you hunt. Days are sticky headers so a long scroll never loses its place.
 */

export const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: '13px var(--font)',
  overflow: 'hidden'
}

export const header: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 18px',
  borderBottom: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)'
}

export const title: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }

export const filters: CSSProperties = { display: 'flex', gap: 6, marginLeft: 'auto' }

export function chip(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 28,
    padding: '0 11px',
    borderRadius: 'var(--r-pill)',
    border: `1px solid ${active ? 'transparent' : 'var(--surface-edge)'}`,
    background: active ? 'var(--ink)' : 'var(--surface-raised)',
    color: active ? 'var(--surface-raised)' : 'var(--ink-2)',
    font: '600 12px var(--font)',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  }
}

export const chipCount: CSSProperties = { opacity: 0.6, fontVariantNumeric: 'tabular-nums' }

export const scroller: CSSProperties = { flex: 1, overflowY: 'auto', padding: '0 0 28px' }

export const dayHeading: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  padding: '14px 18px 6px',
  background: 'var(--surface)',
  font: '600 11px var(--font)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)'
}

/**
 * The row is a shell holding one button for the capture and one per action. Nesting
 * the actions inside a single row-wide button would be invalid markup and would make
 * them unreachable by keyboard, which is most of the point of having them.
 */
export function row(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    margin: '0 12px 2px',
    padding: 7,
    borderRadius: 'var(--r-lg)',
    border: `1px solid ${selected ? 'var(--accent)' : 'transparent'}`,
    background: selected ? 'var(--accent-tint)' : 'transparent',
    listStyle: 'none'
  }
}

export const rowMain: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit'
}

export const list: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' }

export const thumb: CSSProperties = {
  flex: 'none',
  position: 'relative',
  width: 116,
  height: 70,
  borderRadius: 'var(--r-md)',
  overflow: 'hidden',
  background: '#0d1116',
  border: '1px solid var(--surface-edge)',
  display: 'grid',
  placeItems: 'center'
}

export const thumbImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block'
}

/**
 * What a tile shows with no thumbnail. Only a web session says why — it has no pixels,
 * and that is worth knowing. Everywhere else a missing thumbnail is the platform having
 * a bad day, and "NO PREVIEW" repeated down the list is noise pretending to be data.
 */
export const thumbFallback: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  color: 'rgba(255, 255, 255, 0.38)',
  font: '600 10px var(--font)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase'
}

/** Duration, burnt into the corner of the thumbnail the way a video library does it. */
export const thumbBadge: CSSProperties = {
  position: 'absolute',
  right: 5,
  bottom: 5,
  padding: '1px 5px',
  borderRadius: 4,
  background: 'rgba(0, 0, 0, 0.72)',
  color: '#fff',
  font: '600 10px ui-monospace, SFMono-Regular, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums'
}

export const body: CSSProperties = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }

export const name: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

export const meta: CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

export const findings: CSSProperties = { display: 'flex', gap: 6, marginTop: 2 }

/** Findings are the reason to open one capture over another, so they carry the colour. */
export const finding: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
  padding: '1px 7px',
  borderRadius: 'var(--r-pill)',
  border: '1px solid var(--danger)',
  background: 'rgba(255, 59, 48, 0.08)',
  color: '#b3261e',
  font: '600 11px var(--font)'
}

export const at: CSSProperties = {
  flex: 'none',
  color: 'var(--ink-3)',
  font: '12px var(--font)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
}

export const rowActions: CSSProperties = { flex: 'none', display: 'flex', gap: 4, marginLeft: 6 }

export function iconButton(danger = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--surface-edge)',
    background: 'var(--surface-raised)',
    color: danger ? 'var(--danger)' : 'var(--ink-2)',
    cursor: 'pointer'
  }
}

export const empty: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: '100%',
  padding: 40,
  textAlign: 'center',
  color: 'var(--ink-2)'
}

export const emptyTitle: CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--ink)' }

export const kbd: CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 5,
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-sunken)',
  font: '600 12px var(--font)',
  color: 'var(--ink)'
}

export const footer: CSSProperties = {
  flex: 'none',
  padding: '8px 18px',
  borderTop: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  color: 'var(--ink-3)',
  fontSize: 11.5
}
