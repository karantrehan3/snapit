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
  font: '13px var(--font)'
}

export const card: CSSProperties = { padding: '28px 30px 24px', display: 'flex', flexDirection: 'column' }

export const title: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: '-0.03em'
}

export const intro: CSSProperties = {
  margin: '8px 0 20px',
  color: 'var(--ink-2)',
  fontSize: 13,
  lineHeight: 1.55
}

/** Amber while it is the thing standing in the way; green once it is not. */
export function permCard(granted: boolean): CSSProperties {
  return {
    padding: '14px 16px',
    borderRadius: 'var(--r-lg)',
    border: `1px solid ${granted ? 'rgba(52, 199, 89, 0.5)' : 'rgba(255, 179, 64, 0.55)'}`,
    background: granted ? 'rgba(52, 199, 89, 0.08)' : 'rgba(255, 179, 64, 0.1)'
  }
}

export const permHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 14,
  fontWeight: 600
}

export function permIcon(granted: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: '50%',
    flex: 'none',
    background: granted ? 'var(--success)' : '#e8952a',
    color: '#fff'
  }
}

export const permBody: CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--ink-2)',
  fontSize: 12.5,
  lineHeight: 1.55
}

export const actions: CSSProperties = { display: 'flex', gap: 8, marginTop: 12 }

export const primary: CSSProperties = {
  height: 32,
  padding: '0 16px',
  border: 'none',
  borderRadius: 'var(--r-md)',
  background: 'var(--accent)',
  color: 'var(--on-dark)',
  font: '600 13px var(--font)',
  cursor: 'pointer'
}

export const secondary: CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  color: 'var(--ink-2)',
  font: '600 13px var(--font)',
  cursor: 'pointer'
}

export const sectionLabel: CSSProperties = {
  margin: '24px 0 10px',
  font: '600 11px var(--font)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)'
}

export const hotkeyRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 0',
  color: 'var(--ink-2)',
  fontSize: 12.5,
  borderTop: '1px solid var(--surface-edge)'
}

/** Wide enough for three caps; a fixed width let the icon beside it overlap the last one. */
export const hotkey: CSSProperties = { display: 'inline-flex', gap: 3, flex: 'none', minWidth: 84 }

export const keycap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 22,
  padding: '0 5px',
  borderRadius: 5,
  border: '1px solid var(--surface-edge)',
  borderBottomWidth: 2,
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
  font: '600 12px var(--font)'
}

export const what: CSSProperties = {
  margin: '20px 0 0',
  color: 'var(--ink-3)',
  fontSize: 12,
  lineHeight: 1.55
}

export const done: CSSProperties = { marginTop: 22, display: 'flex', justifyContent: 'flex-end' }
