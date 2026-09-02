import type { CSSProperties } from 'react'

/**
 * A route, not a window. The shell supplies the ground, the scroll container and the
 * page padding, so setting any of them here would double the padding and fix the height
 * of something that is inside a scroller.
 */
export const pageStyle: CSSProperties = { maxWidth: 460 }

/**
 * The hotkey recorder's own surface.
 *
 * Not a `Button`: it looks like an input because that is what it is being used as, and
 * it has a state no button has — armed, listening for a chord, with a ring around it
 * saying the next keys pressed are going somewhere.
 */
export function fieldStyle(recording: boolean): CSSProperties {
  return {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    padding: '4px 10px',
    borderRadius: 'var(--r-md)',
    border: `1px solid ${recording ? 'var(--accent)' : 'var(--surface-edge)'}`,
    background: recording ? 'var(--accent-tint)' : 'var(--surface-raised)',
    boxShadow: recording ? '0 0 0 3px rgba(10, 132, 255, 0.15)' : 'none',
    cursor: 'pointer'
  }
}

export const hintStyle: CSSProperties = {
  color: 'var(--ink-3)',
  font: 'var(--t-body) var(--font)'
}
