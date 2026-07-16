import type { CSSProperties } from 'react'

/**
 * Styles shared by every annotation surface (screenshot, image edit).
 * Surface-specific chrome (selection dim, corner handles, hints) stays with its feature.
 */

export function sizePreviewWrap(x: number, y: number): CSSProperties {
  return { position: 'fixed', left: x, top: y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }
}

export function sizePreviewCircle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid #fff',
    background: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)'
  }
}

export const sizePreviewLabel: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  marginTop: 8,
  padding: '1px 6px',
  borderRadius: 3,
  background: 'rgba(0, 0, 0, 0.7)',
  color: '#fff',
  font: '11px -apple-system, system-ui, sans-serif',
  whiteSpace: 'nowrap'
}
