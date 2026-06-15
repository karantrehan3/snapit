import type { CSSProperties } from 'react'

export const veil: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  font: '14px -apple-system, system-ui, sans-serif',
  color: '#fff'
}

export const regionBox: CSSProperties = {
  position: 'fixed',
  border: '2px solid #ff3b30',
  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
  pointerEvents: 'none'
}

export const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 24,
  minWidth: 560,
  maxWidth: 620,
  borderRadius: 14,
  background: 'rgba(28, 28, 30, 0.96)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)'
}

export const segmented: CSSProperties = {
  display: 'flex',
  padding: 3,
  borderRadius: 9,
  background: 'rgba(255, 255, 255, 0.08)'
}

export function segment(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: 30,
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: active ? '#0a84ff' : 'transparent'
  }
}

export const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer'
}

export const sourceGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
  maxHeight: 320,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: 2
}

export function sourceItem(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
    padding: 6,
    border: active ? '2px solid #0a84ff' : '2px solid transparent',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.06)',
    cursor: 'pointer',
    color: '#fff',
    textAlign: 'left'
  }
}

export const sourceThumb: CSSProperties = {
  width: '100%',
  height: 84,
  objectFit: 'contain',
  borderRadius: 4,
  background: '#000'
}

export const sourceName: CSSProperties = {
  fontSize: 11,
  color: 'rgba(255, 255, 255, 0.8)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

export const hint: CSSProperties = { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }

export const picker: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }

export const countdownRoot: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none'
}

export const countdownNumber: CSSProperties = {
  width: 160,
  height: 160,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(28, 28, 30, 0.72)',
  color: '#fff',
  font: '700 84px -apple-system, system-ui, sans-serif',
  boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
  animation: 'snapitPop 0.35s ease-out'
}

export const spinnerWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 200,
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 13
}

export const spinner: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: '3px solid rgba(255, 255, 255, 0.2)',
  borderTopColor: '#0a84ff',
  animation: 'snapitSpin 0.8s linear infinite'
}

export const errorText: CSSProperties = { fontSize: 12, color: '#ff453a' }

export function btn(bg: string): CSSProperties {
  return {
    flex: 1,
    height: 34,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: bg
  }
}

export const pill: CSSProperties = {
  position: 'fixed',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(28, 28, 30, 0.95)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
  color: '#fff',
  font: '13px -apple-system, system-ui, sans-serif',
  pointerEvents: 'auto'
}

export const grip: CSSProperties = {
  cursor: 'grab',
  color: 'rgba(255, 255, 255, 0.45)',
  fontSize: 16,
  lineHeight: 1,
  userSelect: 'none'
}

export const recDot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#ff3b30',
  boxShadow: '0 0 0 0 rgba(255, 59, 48, 0.6)',
  animation: 'snapitPulse 1.4s ease-out infinite'
}

export const stopButton: CSSProperties = {
  height: 26,
  padding: '0 12px',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  background: '#ff3b30'
}
