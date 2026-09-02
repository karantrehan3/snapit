import type { CSSProperties } from 'react'

/**
 * The web-capture session bar: the one piece of chrome on screen while snapit is
 * collecting from a browser it launched.
 *
 * It docks top-centre like the record bar, because it is the same kind of object — a
 * floating control over someone else's screen — and the two should not look like they
 * came from different applications.
 */

export const bar: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: 30,
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  maxWidth: 'min(760px, 92vw)',
  padding: '10px 12px 10px 16px',
  borderRadius: 'var(--r-xl)',
  background: 'var(--glass)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  border: '1px solid var(--glass-edge)',
  boxShadow: 'var(--shadow-bar)',
  color: 'var(--on-dark)',
  font: '13px var(--font)',
  pointerEvents: 'auto'
}

export const copy: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }

export const headline: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontWeight: 600,
  whiteSpace: 'nowrap'
}

/** Amber while setting up, red once anything is being kept. */
export function statusDot(capturing: boolean): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flex: 'none',
    background: capturing ? 'var(--danger)' : 'var(--warning)',
    ...(capturing ? { animation: 'snapitPulse 1.4s ease-out infinite' } : {})
  }
}

export const detail: CSSProperties = {
  color: 'var(--on-dark-2)',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

/** Shown when the browser window could not be identified, so there will be no video. */
export const warning: CSSProperties = { color: 'var(--warning)', fontSize: 12 }

export const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }
