import type { CSSProperties } from 'react'

/**
 * First run. The permission card carries the weight — it is the reason this window
 * exists, and everything else on the page is quieter than it on purpose.
 */

export const page: CSSProperties = {
  height: '100vh',
  overflowY: 'auto',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'var(--t-body) var(--font)'
}

export const card: CSSProperties = { padding: '28px 30px 24px', display: 'flex', flexDirection: 'column' }

export const title: CSSProperties = {
  margin: 0,
  fontSize: 'var(--t-display)',
  fontWeight: 700,
  letterSpacing: '-0.03em'
}

export const intro: CSSProperties = {
  margin: '8px 0 20px',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-body)',
  lineHeight: 1.55
}

export const actions: CSSProperties = { display: 'flex', gap: 8, marginTop: 12 }

/** Sentence case: it introduces the three rows under it, and it is not a data label. */
export const sectionLabel: CSSProperties = {
  margin: '24px 0 10px',
  font: '600 var(--t-small) var(--font)',
  color: 'var(--ink-2)'
}

export const hotkeyRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 0',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  borderTop: '1px solid var(--surface-edge)'
}

/** Wide enough for three caps; a fixed width let the icon beside it overlap the last one. */
export const hotkey: CSSProperties = { flex: 'none', minWidth: 84 }

export const what: CSSProperties = {
  margin: '20px 0 0',
  color: 'var(--ink-3)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.55
}

export const done: CSSProperties = { marginTop: 22, display: 'flex', justifyContent: 'flex-end' }
