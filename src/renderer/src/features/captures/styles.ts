import type { CSSProperties } from 'react'

/**
 * The home window: the capture list, and the capture.
 *
 * Two panes rather than a list that opens things elsewhere. The list is narrow and
 * fixed, because scanning down forty captures wants a column and not a grid, and the
 * capture takes everything left over — a recording is the widest thing snapit owns and
 * the report beside it is two columns of its own.
 *
 * ## It is the same instrument as the report
 *
 * The window frames a report one pixel away, and a report is a designed thing already:
 * severity as a left border, values in a monospace so columns of them line up, colour
 * spent only where something is wrong. This does not put a second design system around
 * that. It uses the same devices, and its colours are the report's own — `tokens.css`
 * says why.
 *
 * Two consequences worth naming, because both replaced something that looked fine on its
 * own and wrong beside the report:
 *
 * - **Rows are rules, not cards.** Every capture used to be a rounded box with the same
 *   radius and the same border as every other, so a list of forty read as forty
 *   identical objects and the one holding the 500 looked like all the rest. A capture
 *   with findings now carries a red left edge and a clean one carries none, which turns
 *   "which one was the bug" into a single line down the list.
 * - **Findings are numbers, not pills.** A pill is as wide as its label, so a column of
 *   them cannot be read down. The counts are monospace, so the number is what the eye
 *   lands on and the word after it stays quiet.
 */

/**
 * The route fills the frame the shell gives it.
 *
 * `flex: 1` and `minWidth: 0` are both load-bearing. This is a flex item of the shell's
 * row, and without them a div sizes to its content — which made the detail pane about
 * 800px instead of the ~1080 available, pushing the report into its narrow one-column
 * layout with a third of the pane empty beside it. It used to be a whole window, where
 * `height: 100vh` was right and width took care of itself.
 */
export const columns: CSSProperties = {
  display: 'flex',
  flex: 1,
  minWidth: 0,
  height: '100%',
  overflow: 'hidden'
}

/** Fixed, so the capture beside it does not resize every time the selection moves. */
export const listPane: CSSProperties = {
  flex: 'none',
  width: 380,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  borderRight: '1px solid var(--surface-edge)',
  background: 'var(--surface)'
}

export const listHeader: CSSProperties = {
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '14px 14px 12px',
  borderBottom: '1px solid var(--surface-edge)'
}

export const title: CSSProperties = {
  margin: 0,
  fontSize: 'var(--t-strong)',
  fontWeight: 600,
  letterSpacing: '-0.01em'
}

export const filters: CSSProperties = { display: 'flex', gap: 6 }

export const scroller: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 16px' }

/**
 * Sentence case, and no rule of its own.
 *
 * "Today" is the content of this heading, not a caption above the content — `format.ts`
 * already returns it in the form a person would say it, and shouting it in capitals
 * added noise every fourth row without adding a word. The space above it groups the
 * days; a rule underneath only repeated the one the first row already draws.
 */
export const dayHeading: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  margin: 0,
  padding: '14px 14px 6px',
  background: 'var(--surface)',
  font: '600 var(--t-small) var(--font)',
  color: 'var(--ink-3)'
}

export const list: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' }

/**
 * The left edge is severity and only severity, so the line it draws down the list means
 * one thing all the way down. Selection is the background — putting it on the same edge
 * would make the row you are looking at the one row that cannot tell you whether it is
 * the broken one.
 */
export function row(selected: boolean, findings: boolean): CSSProperties {
  return {
    borderLeft: `2px solid ${findings ? 'var(--danger-ink)' : 'transparent'}`,
    borderBottom: '1px solid var(--rule)',
    background: selected ? 'var(--selected)' : 'transparent',
    listStyle: 'none'
  }
}

export const rowMain: CSSProperties = {
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  width: '100%',
  padding: '9px 12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit'
}

/** Size comes from `CaptureRow`, which is the one place that knows the densities. */
export const thumb: CSSProperties = {
  flex: 'none',
  position: 'relative',
  borderRadius: 4,
  overflow: 'hidden',
  background: 'var(--mat)',
  border: '1px solid var(--surface-edge)',
  display: 'grid',
  placeItems: 'center'
}

export const body: CSSProperties = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }

export const name: CSSProperties = {
  fontSize: 'var(--t-small)',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

export const meta: CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--t-small)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

export const at: CSSProperties = {
  flex: 'none',
  alignSelf: 'flex-start',
  color: 'var(--ink-3)',
  font: 'var(--t-micro) var(--mono)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
}

export const empty: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: '100%',
  padding: '40px 24px',
  textAlign: 'center',
  color: 'var(--ink-2)'
}

export const emptyTitle: CSSProperties = { fontSize: 'var(--t-strong)', fontWeight: 600, color: 'var(--ink)' }

export const footer: CSSProperties = {
  flex: 'none',
  padding: '7px 14px',
  borderTop: '1px solid var(--surface-edge)',
  color: 'var(--ink-3)',
  fontSize: 'var(--t-micro)'
}

export const detailPane: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: 'var(--surface)'
}

/**
 * Deliberately thin.
 *
 * It used to carry the name, the kind, the duration, the step count and the size — and
 * then the report immediately below it carried the title, the date, the duration, the
 * filename and the same counts again. The header's job is the two things the report
 * cannot say: which folder this is on disk, and what you can do with it.
 */
export const detailHead: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '9px 14px',
  borderBottom: '1px solid var(--surface-edge)'
}

/** Monospace because it is a path, and quiet because the report says the title louder. */
export const detailName: CSSProperties = {
  margin: 0,
  minWidth: 0,
  flex: 1,
  font: '400 var(--t-small) var(--mono)',
  color: 'var(--ink-2)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

/**
 * Which capture, and a way to the next one.
 *
 * Present whether or not the list is, because with the list hidden it is the only way to
 * move — and a control that appears only when it becomes essential is a control nobody
 * knows about.
 */
export const switcher: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 2px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--surface-edge)'
}

export const switcherCount: CSSProperties = {
  minWidth: 62,
  textAlign: 'center',
  color: 'var(--ink-3)',
  font: 'var(--t-small) var(--mono)',
  fontVariantNumeric: 'tabular-nums'
}

export const detailActions: CSSProperties = { flex: 'none', display: 'flex', gap: 4, marginLeft: 'auto' }

export const detailBody: CSSProperties = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }

/**
 * The frame fills the pane and scrolls itself.
 *
 * `border: none` rather than a border of ours: the report is already a page with its own
 * edges and margins, and a frame drawn around it reads as a box inside a box. Now that
 * the two share a palette there is nothing for a border to separate.
 */
export const frame: CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  border: 'none',
  background: 'var(--surface)',
  display: 'block'
}

/**
 * What a capture with no report gets: the file itself, on a mat.
 *
 * Near-black in both schemes, because this sits behind an image whose own background is
 * unknown. A screenshot of a white page needs an edge, and a mat gives it one without
 * claiming to be part of the picture — which is why it does not lighten in light mode
 * along with everything else.
 */
export const mediaHolder: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  // `minmax(0, 1fr)` rather than the default `auto`, which sizes the track to the
  // image's natural width — a 1646px screenshot then made a 1646px track, and the
  // image's own `maxWidth: 100%` resolved against that instead of against the pane.
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridTemplateRows: 'minmax(0, 1fr)',
  placeItems: 'center',
  padding: 18,
  background: 'var(--mat)',
  overflow: 'hidden'
}

export const mediaVideo: CSSProperties = { maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--r-lg)' }

export const mediaImage: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: 'var(--r-lg)'
}

export const nothing: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: '100%',
  padding: '40px 32px',
  maxWidth: 420,
  margin: '0 auto',
  textAlign: 'center',
  color: 'var(--ink-3)'
}

export const nothingTitle: CSSProperties = {
  fontSize: 'var(--t-strong)',
  fontWeight: 600,
  color: 'var(--ink-2)'
}
