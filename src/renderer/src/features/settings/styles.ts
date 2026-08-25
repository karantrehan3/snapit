import type { CSSProperties } from 'react'

export const pageStyle: CSSProperties = {
  padding: 24,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  background: 'var(--surface)',
  height: '100vh',
  boxSizing: 'border-box'
}

export const inputStyle: CSSProperties = {
  flex: 1,
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
  font: '13px var(--font)'
}

export const browseStyle: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  cursor: 'pointer',
  font: '13px var(--font)'
}

export const saveStyle: CSSProperties = {
  height: 32,
  padding: '0 18px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--on-dark)',
  fontWeight: 600,
  cursor: 'pointer',
  font: '13px var(--font)'
}

export const closeStyle: CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 6,
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  cursor: 'pointer',
  font: '13px var(--font)'
}

export function fieldStyle(recording: boolean): CSSProperties {
  return {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${recording ? 'var(--accent)' : 'var(--surface-edge)'}`,
    background: recording ? 'var(--accent-tint)' : 'var(--surface-raised)',
    boxShadow: recording ? '0 0 0 3px rgba(10, 132, 255, 0.15)' : 'none',
    cursor: 'pointer'
  }
}

export function keycapStyle(dim: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 22,
    height: 24,
    padding: '0 7px',
    borderRadius: 5,
    background: dim ? '#dce8fb' : 'var(--surface-sunken)',
    border: '1px solid #d0d0d4',
    boxShadow: '0 1px 0 #d0d0d4',
    color: 'var(--ink)',
    font: '13px var(--font)',
    fontWeight: 600
  }
}

export const hintStyle: CSSProperties = {
  color: 'var(--ink-3)',
  font: '13px var(--font)'
}
