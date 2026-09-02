import type { CSSProperties } from 'react'

/** Screen dim used during setup — matches the screenshot overlay's grey veil. */
export const DIM = 'rgba(165, 165, 170, 0.42)'

/**
 * Transparent full-screen layer for the setup phase — the live screen shows
 * through (only the floating command bar and, in region mode, the selection box
 * provide chrome), while this layer still captures the region-drag gesture.
 */
export const stage: CSSProperties = {
  position: 'fixed',
  inset: 0,
  userSelect: 'none',
  font: '13px var(--font)',
  color: 'var(--on-dark)'
}

/** Frosted-glass control bar, docked bottom-centre and floating over the screen. */
export const commandBar: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: 30,
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 16,
  background: 'var(--glass)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  border: '1px solid var(--glass-edge)',
  boxShadow: 'var(--shadow-bar)',
  color: 'var(--on-dark)',
  font: '13px var(--font)'
}

export const barDivider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  margin: '3px 2px',
  background: 'rgba(255, 255, 255, 0.14)'
}

/** A pill-shaped control inside the bar (source button, fps button, etc.). */
export const barControl: CSSProperties = {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 36,
  padding: '0 12px',
  borderRadius: 11,
  border: '1px solid var(--glass-edge)',
  background: 'var(--glass-fill)',
  color: 'var(--on-dark)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}

export const caret: CSSProperties = { opacity: 0.55, fontSize: 10 }

export function iconToggle(active: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: 36,
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    cursor: 'pointer',
    fontSize: 15,
    color: 'var(--on-dark)',
    border: active ? '1px solid rgba(10, 132, 255, 0.9)' : '1px solid var(--glass-edge)',
    background: active ? 'var(--accent-fill)' : 'var(--glass-fill)'
  }
}

export const ghostIcon: CSSProperties = {
  boxSizing: 'border-box',
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 11,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.65)',
  fontSize: 15,
  cursor: 'pointer'
}

/** The one button that starts a capture. It has only ever been red. */
export const recordButton: CSSProperties = {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 36,
  padding: '0 18px',
  border: 'none',
  borderRadius: 'var(--r-lg)',
  cursor: 'pointer',
  color: 'var(--on-dark)',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--danger)',
  boxShadow: '0 2px 12px rgba(255, 59, 48, 0.45)'
}

/** A popover anchored above a bar control (source picker / fps menu). */
export const popover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  padding: 12,
  borderRadius: 14,
  background: 'var(--glass-strong)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  border: '1px solid var(--glass-edge)',
  boxShadow: 'var(--shadow-pop)',
  zIndex: 2
}

export const fpsInput: CSSProperties = {
  width: 60,
  height: 30,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(0, 0, 0, 0.3)',
  color: 'var(--on-dark)',
  fontVariantNumeric: 'tabular-nums'
}

/** Subtle text link (e.g. the GIF panel's "record video instead" nudge). */
export const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 6px',
  color: 'var(--accent)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}

/** Centred hint shown while dragging out a region. */
export const centerHint: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: 100,
  transform: 'translateX(-50%)',
  padding: '8px 14px',
  borderRadius: 999,
  background: 'rgba(28, 28, 30, 0.8)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  fontSize: 13,
  color: 'rgba(255, 255, 255, 0.9)',
  pointerEvents: 'none'
}

export const regionBox: CSSProperties = {
  position: 'fixed',
  border: '2px solid var(--danger)',
  boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 9999px ${DIM}`,
  pointerEvents: 'none'
}

/** Region outline kept on screen *during* recording — no dim (the screen stays
 * usable), and the overlay is content-protected so this border isn't captured. */
export const recordingBorder: CSSProperties = {
  position: 'fixed',
  border: '2px solid var(--danger)',
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
  pointerEvents: 'none'
}

export const segmented: CSSProperties = {
  display: 'flex',
  padding: 3,
  borderRadius: 9,
  background: 'var(--glass-fill-strong)'
}

/**
 * `nudged` marks the inactive option snapit thinks is the right one — used when the
 * selected window names a browser. It reads as a suggestion rather than a state, which
 * is why it is a marker and a tint rather than the selected background.
 */
export function segment(active: boolean, nudged = false): CSSProperties {
  return {
    boxSizing: 'border-box',
    flex: 1,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '0 10px',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    color: 'var(--on-dark)',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: active ? 'var(--accent)' : nudged ? 'var(--glass-fill-strong)' : 'transparent'
  }
}

/** The amber dot on a nudged segment — the same colour the session bar uses for "not yet". */
export const nudgeDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flex: 'none',
  background: '#ffb340'
}

/** Full/Region toggle sizing inside the command bar (fixed width so halves are even). */
export const barSegmented: CSSProperties = {
  ...segmented,
  boxSizing: 'border-box',
  height: 36,
  padding: 3,
  width: 160
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
    border: active ? '2px solid var(--accent)' : '2px solid transparent',
    borderRadius: 8,
    background: 'var(--glass-fill)',
    cursor: 'pointer',
    color: 'var(--on-dark)',
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
  borderTopColor: 'var(--accent)',
  animation: 'snapitSpin 0.8s linear infinite'
}

export const errorText: CSSProperties = { fontSize: 12, color: 'var(--danger-bright)' }

export const pill: CSSProperties = {
  position: 'fixed',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'var(--glass-solid)',
  boxShadow: 'var(--shadow-pill)',
  color: 'var(--on-dark)',
  font: '13px var(--font)',
  pointerEvents: 'auto'
}

export const grip: CSSProperties = {
  cursor: 'grab',
  color: 'var(--on-dark-3)',
  fontSize: 16,
  lineHeight: 1,
  userSelect: 'none'
}

export const recDot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: 'var(--danger)',
  boxShadow: '0 0 0 0 rgba(255, 59, 48, 0.6)',
  animation: 'snapitPulse 1.4s ease-out infinite'
}

/** Toggle inside the recording pill (draw mode) — rounder and smaller than iconToggle. */
export function pillToggle(active: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: 26,
    height: 26,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--on-dark)',
    border: active ? '1px solid rgba(10, 132, 255, 0.9)' : '1px solid rgba(255, 255, 255, 0.18)',
    background: active ? 'rgba(10, 132, 255, 0.32)' : 'var(--glass-fill-strong)'
  }
}

/** The marker button grows to hold its count; without one it stays a square icon. */
export function markerButton(count: number): CSSProperties {
  return {
    ...pillToggle(false),
    gap: 4,
    width: count > 0 ? 'auto' : 26,
    padding: count > 0 ? '0 8px' : 0
  }
}

export const markerCount: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums'
}

export const stopButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 26,
  padding: '0 12px',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  color: 'var(--on-dark)',
  fontSize: 12,
  fontWeight: 600,
  background: 'var(--danger)'
}
