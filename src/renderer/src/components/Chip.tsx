import type { ButtonHTMLAttributes, CSSProperties, ReactElement } from 'react'
import type { ButtonTone } from './Button'

/**
 * A filter, as a pill that knows whether it is on.
 *
 * Not a `Button` with a `selected` prop: a chip answers "is this narrowed?" rather than
 * "what happens if I press this", so it is `aria-pressed` and it inverts when it is on,
 * where a selected button would only tint. Keeping them apart also keeps the button's
 * variant list from growing a state that only one shape of control has.
 *
 * `count` is part of the chip rather than something a caller appends, because a filter
 * with no count is a promise about what is behind it — "With problems" reads very
 * differently from "With problems 0", and the second one saves opening it.
 */
export function Chip({
  selected,
  count,
  tone = 'window',
  children,
  type = 'button',
  ...rest
}: {
  selected: boolean
  count?: number
  tone?: ButtonTone
  children: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'style'>): ReactElement {
  const glass = tone === 'glass'
  const style: CSSProperties = {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 28,
    padding: '0 11px',
    borderRadius: 'var(--r-pill)',
    font: '600 var(--t-small) var(--font)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ...(selected
      ? {
          // The report marks its active tab in `--focus` with white on it. A white pill
          // would be the brightest thing in the window, which a filter is not.
          border: '1px solid transparent',
          background: glass ? 'var(--on-dark)' : 'var(--focus)',
          color: glass ? 'var(--ink)' : '#fff'
        }
      : glass
        ? {
            border: '1px solid var(--glass-edge)',
            background: 'var(--glass-fill)',
            color: 'var(--on-dark-2)'
          }
        : {
            border: '1px solid var(--surface-edge)',
            background: 'var(--surface-raised)',
            color: 'var(--ink-2)'
          })
  }

  return (
    <button {...rest} type={type} aria-pressed={selected} data-chip={selected} data-tone={tone} style={style}>
      {children}
      {count !== undefined && (
        <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </button>
  )
}
