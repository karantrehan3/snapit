import type { CSSProperties } from 'react'

/**
 * The application shell.
 *
 * One window with the sections down the side, which is the shape the app should have had
 * from the start: it used to navigate through a menu bar dropdown into five separate OS
 * windows, so there was no surface that was ever simply "snapit open".
 *
 * The sidebar costs 202px permanently, taken from the widest thing snapit renders. Two
 * things pay for it. It is where state lives — whether Screen Recording is granted,
 * whether a session is collecting, whether Claude Code is attached — and that is the
 * question you actually have on opening a background tool. And the Captures route can
 * give the width back on demand: the capture list collapses to a filmstrip when you are
 * reading one, so the report is widest exactly when it is being read.
 */

export const app: CSSProperties = {
  display: 'flex',
  height: '100vh',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'var(--t-body) var(--font)',
  overflow: 'hidden'
}

/** Recessed relative to the content, so the content reads as the thing in front. */
export const sidebar: CSSProperties = {
  flex: 'none',
  width: 202,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: 'var(--sidebar)',
  borderRight: '1px solid var(--surface-edge)'
}

/**
 * The lockup's strip.
 *
 * It used to hold a 62px spacer for the traffic lights, which put the lockup at a left
 * edge nothing else shared. The home window is framed — the lights are in the title bar,
 * above this, not over it — so the spacer was arbitrary. Centred instead: the lockup is
 * the one thing up here that is not a control, and it has the strip to itself.
 *
 * 68 rather than the 46 that matched the content bar beside it. Lining the wordmark up
 * with the route title across the divider is worth something, but not a logo wedged
 * between two edges: at 46 a 34px mark left 6px of air, which reads as a mistake rather
 * than as restraint. 17 above and below is the padding a mark this size asks for, and
 * the divider it now misses is 202px away.
 */
export const brand: CSSProperties = {
  flex: 'none',
  height: 68,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  padding: '0 10px'
}

/**
 * snapit's own mark, at a size where it is actually a logo.
 *
 * 34 is 34 now. Every earlier number here was compensating for the artwork: `appIcon`
 * inlined the macOS app icon whole, 9% transparent margin included, so 20 drew twelve
 * pixels of red and 40 drew a 33px mark inside a 40px box that nothing lined up with.
 * The data URL is cropped to the mark itself, so this is the size on screen.
 *
 * No border radius: the artwork's corners are already rounded, with transparency outside
 * them.
 */
export const mark: CSSProperties = {
  flex: 'none',
  width: 34,
  height: 34,
  objectFit: 'contain',
  display: 'block'
}

export const brandName: CSSProperties = {
  fontSize: 'var(--t-body)',
  fontWeight: 600,
  letterSpacing: '-0.01em'
}

/** The create action's own block, so the menu it opens is not clipped by the nav's scroll. */
export const create: CSSProperties = { flex: 'none', padding: '2px 10px 8px', position: 'relative' }

export const nav: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  padding: '8px 8px 0',
  overflowY: 'auto',
  minHeight: 0
}

export function navItem(active: boolean, soon: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '7px 9px',
    borderRadius: 'var(--r-md)',
    border: 'none',
    background: active ? 'var(--selected)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    font: `${active ? 600 : 400} var(--t-body) var(--font)`,
    textAlign: 'left',
    cursor: soon ? 'default' : 'pointer',
    opacity: soon ? 0.42 : 1
  }
}

/** Counts, so a section says how much is in it before you go there. */
export const navCount: CSSProperties = {
  marginLeft: 'auto',
  color: 'var(--ink-3)',
  font: '500 var(--t-micro) var(--mono)',
  fontVariantNumeric: 'tabular-nums'
}

export const navGroup: CSSProperties = {
  padding: '14px 9px 5px',
  font: '600 var(--t-micro) var(--font)',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)'
}

/**
 * The permission that causes every black-frame capture, the session that may be running
 * and whether an agent is attached — the three things worth knowing without asking.
 */
export const statusFoot: CSSProperties = {
  marginTop: 'auto',
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  padding: '10px 12px 12px',
  borderTop: '1px solid var(--rule)'
}

export const statusRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)'
}

export function dot(tone: 'ok' | 'warn' | 'bad' | 'idle'): CSSProperties {
  const fill =
    tone === 'ok'
      ? 'var(--success)'
      : tone === 'warn'
        ? 'var(--warning)'
        : tone === 'bad'
          ? 'var(--danger-ink)'
          : 'var(--ink-3)'
  return { flex: 'none', width: 6, height: 6, borderRadius: '50%', background: fill }
}

/** A live session pulses, because it is the one status that is happening rather than being. */
export const livePulse: CSSProperties = { animation: 'snapitPulse 1.6s ease-out infinite' }

export const main: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }

export const bar: CSSProperties = {
  flex: 'none',
  height: 46,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 14px',
  borderBottom: '1px solid var(--surface-edge)'
}

export const barTitle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--t-strong)',
  fontWeight: 600,
  letterSpacing: '-0.01em'
}

export const barSpacer: CSSProperties = { marginLeft: 'auto' }

/** Routes that are read rather than operated get the scroll container and the measure. */
export const routeScroll: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' }

export const routeInner: CSSProperties = {
  padding: '20px 22px 40px',
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
  maxWidth: 940
}

/** Two panes manage their own scrolling, so the shell must not add another. */
export const routeBare: CSSProperties = { flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }

export const sectionHead: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  marginBottom: 10
}

export const sectionTitle: CSSProperties = { margin: 0, fontSize: 'var(--t-body)', fontWeight: 600 }

export const sectionMore: CSSProperties = { marginLeft: 'auto' }

export const soonNote: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  height: '100%',
  padding: '48px 32px',
  maxWidth: 460,
  margin: '0 auto',
  textAlign: 'center',
  color: 'var(--ink-3)'
}

export const soonTitle: CSSProperties = { fontSize: 'var(--t-title)', fontWeight: 600, color: 'var(--ink-2)' }
