import type { CSSProperties } from 'react'

/**
 * Styles shared by every annotation surface (screenshot, image edit, live recording).
 * Surface-specific chrome (selection dim, corner handles, hints) stays with its feature.
 */

// --- Toolbar chrome ---
// One definition for every annotation toolbar. A drawing toolbar should look the same
// whether you're marking up a screenshot or a live recording; only the *actions*
// differ (a recording has nothing to undo, copy or save-as).

export const toolbarBar: CSSProperties = {
  position: 'fixed',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 8px',
  background: 'var(--glass-solid)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-toolbar)',
  font: '14px var(--font)'
}

export const toolbarSep: CSSProperties = {
  width: 1,
  height: 22,
  background: 'rgba(255, 255, 255, 0.2)',
  margin: '0 4px'
}

export function toolbarBtn(active: boolean, disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    color: 'var(--on-dark)',
    fontSize: 15,
    opacity: disabled ? 0.4 : 1,
    background: active ? 'var(--accent)' : 'var(--glass-fill-strong)'
  }
}

export function toolbarSwatch(color: string, active: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
    background: color,
    border: active ? '2px solid var(--on-dark)' : '2px solid rgba(255, 255, 255, 0.25)'
  }
}

/** Custom-color swatch: a rainbow ring with the picked color in the center. */
export function toolbarCustomSwatch(active: boolean, color: string): CSSProperties {
  return {
    position: 'relative',
    display: 'inline-block',
    width: 22,
    height: 22,
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
    boxShadow: active ? `inset 0 0 0 4px ${color}, 0 0 0 2px #fff` : 'inset 0 0 0 4px rgba(0,0,0,0.25)'
  }
}

export const palettePopover: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: 8,
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 20px)',
  gap: 5,
  padding: 8,
  background: 'var(--glass-raised)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  zIndex: 10
}

export function paletteSwatch(color: string, active: boolean): CSSProperties {
  return {
    width: 20,
    height: 20,
    borderRadius: 4,
    cursor: 'pointer',
    background: color,
    border: active ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.25)'
  }
}

export function toolbarAction(bg: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    padding: '0 12px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'var(--on-dark)',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: bg
  }
}

export function sizePreviewWrap(x: number, y: number): CSSProperties {
  return { position: 'fixed', left: x, top: y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }
}

export function sizePreviewCircle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid var(--on-dark)',
    background: 'rgba(255, 255, 255, 0.15)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)'
  }
}

/** Font-size preview: a specimen glyph at the actual size, not a stroke circle. */
export function sizePreviewGlyph(size: number): CSSProperties {
  return {
    display: 'grid',
    placeItems: 'center',
    minWidth: size,
    height: size,
    color: 'var(--on-dark)',
    // Line height rides inside the shorthand rather than beside it: `font` already
    // sets line-height, and React warns on every rerender that updates one next to the
    // other — which here is every tick of a ⌘+scroll.
    font: `600 ${size}px/1 var(--font)`,
    textShadow: '0 0 3px rgba(0, 0, 0, 0.9)'
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
  color: 'var(--on-dark)',
  font: '11px var(--font)',
  whiteSpace: 'nowrap'
}
