import type { CSSProperties, ReactElement } from 'react'

/**
 * One key, drawn as a key.
 *
 * Three of these existed: Welcome's had a thicker bottom border, Settings' had a box
 * shadow and a different grey, and the library's empty state had neither. They appear
 * within one window of each other during first run, which is where the drift showed.
 *
 * `held` is the state the hotkey recorder is in while someone has the keys down. It is
 * a separate look rather than a hover, because nothing is being pointed at — the
 * feedback is "I can see what you are pressing", and it has to be visible the whole
 * time the chord is held.
 */
export function KeyCap({ children, held = false }: { children: string; held?: boolean }): ReactElement {
  return <kbd style={held ? heldStyle : style}>{children}</kbd>
}

const style: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 22,
  padding: '0 6px',
  borderRadius: 5,
  border: '1px solid var(--surface-edge)',
  // The one part of a key that is not a rectangle: a heavier bottom edge is what makes
  // it read as a key rather than as a tag.
  borderBottomWidth: 2,
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
  font: '600 var(--t-small) var(--font)'
}

const heldStyle: CSSProperties = {
  ...style,
  border: '1px solid var(--accent-soft-edge)',
  borderBottomWidth: 2,
  background: 'var(--accent-tint)',
  color: 'var(--accent-press)'
}

/** Several caps as one chord. `⌘ ⇧ 9` is three keys, not a nine-character label. */
export const keyRow: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3 }
