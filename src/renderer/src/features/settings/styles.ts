import type { CSSProperties } from 'react'

export const pageStyle: CSSProperties = {
  padding: 24,
  fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  color: '#1c1c1e',
  background: '#f5f5f7',
  height: '100vh',
  boxSizing: 'border-box'
}

export const inputStyle: CSSProperties = {
  flex: 1,
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  color: '#1c1c1e',
  font: '13px -apple-system, system-ui, sans-serif'
}

export const browseStyle: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
}

export const saveStyle: CSSProperties = {
  height: 32,
  padding: '0 18px',
  borderRadius: 6,
  border: 'none',
  background: '#0a84ff',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
}

export const closeStyle: CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
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
    border: `1px solid ${recording ? '#0a84ff' : '#c7c7cc'}`,
    background: recording ? '#eef6ff' : '#fff',
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
    background: dim ? '#dce8fb' : '#f2f2f4',
    border: '1px solid #d0d0d4',
    boxShadow: '0 1px 0 #d0d0d4',
    color: '#1c1c1e',
    font: '13px -apple-system, system-ui, sans-serif',
    fontWeight: 600
  }
}

export const hintStyle: CSSProperties = {
  color: '#8e8e93',
  font: '13px -apple-system, system-ui, sans-serif'
}
