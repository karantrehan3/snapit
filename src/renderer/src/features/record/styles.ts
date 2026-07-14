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
  font: '13px -apple-system, system-ui, sans-serif',
  color: '#fff'
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
  background: 'rgba(28, 28, 30, 0.72)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  boxShadow: '0 16px 50px rgba(0, 0, 0, 0.5)',
  color: '#fff',
  font: '13px -apple-system, system-ui, sans-serif'
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
  border: '1px solid rgba(255, 255, 255, 0.14)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#fff',
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
    color: '#fff',
    border: active ? '1px solid rgba(10, 132, 255, 0.9)' : '1px solid rgba(255, 255, 255, 0.14)',
    background: active ? 'rgba(10, 132, 255, 0.28)' : 'rgba(255, 255, 255, 0.06)'
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

export function primaryButton(bg: string): CSSProperties {
  return {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    height: 36,
    padding: '0 18px',
    border: 'none',
    borderRadius: 11,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    background: bg,
    boxShadow: bg === '#ff3b30' ? '0 2px 12px rgba(255, 59, 48, 0.45)' : 'none'
  }
}

/** A popover anchored above a bar control (source picker / fps menu). */
export const popover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  padding: 12,
  borderRadius: 14,
  background: 'rgba(28, 28, 30, 0.92)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  boxShadow: '0 18px 55px rgba(0, 0, 0, 0.6)',
  zIndex: 2
}

export const fpsInput: CSSProperties = {
  width: 60,
  height: 30,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(0, 0, 0, 0.3)',
  color: '#fff',
  fontVariantNumeric: 'tabular-nums'
}

/** Subtle text link (e.g. the GIF panel's "record video instead" nudge). */
export const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 6px',
  color: '#0a84ff',
  font: 'inherit',
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
  border: '2px solid #ff3b30',
  boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 9999px ${DIM}`,
  pointerEvents: 'none'
}

/** Region outline kept on screen *during* recording — no dim (the screen stays
 * usable), and the overlay is content-protected so this border isn't captured. */
export const recordingBorder: CSSProperties = {
  position: 'fixed',
  border: '2px solid #ff3b30',
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
  pointerEvents: 'none'
}

export const segmented: CSSProperties = {
  display: 'flex',
  padding: 3,
  borderRadius: 9,
  background: 'rgba(255, 255, 255, 0.08)'
}

export function segment(active: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    flex: 1,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 10px',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: active ? '#0a84ff' : 'transparent'
  }
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
