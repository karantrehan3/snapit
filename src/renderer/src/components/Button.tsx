import type { ButtonHTMLAttributes, CSSProperties, ReactElement, ReactNode, Ref } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Every button in the app.
 *
 * There were nine of these before this file: an accent-filled one in Welcome, a
 * different accent-filled one in Settings, a third in About at a third height; two
 * outlined ones that differed only in padding; a square icon button in the library; and
 * a red one in the session bar. None of them disagreed on purpose. They drifted because
 * a button is four lines of CSS and writing those four lines is always easier than
 * finding where the last one lives — so the app grew a new one per surface.
 *
 * `variant` says what the button is for and `tone` says which family it is in — chrome
 * floating over someone else's screen, or a window of ours. Those two are also the
 * attributes the hover, focus and press states in `tokens.css` are keyed on, which is
 * the one part of a button an inline style object cannot express.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
export type ButtonTone = 'window' | 'glass'
export type ButtonSize = 'sm' | 'md' | 'lg'

const HEIGHT: Record<ButtonSize, number> = { sm: 30, md: 32, lg: 34 }
const PADDING: Record<ButtonSize, number> = { sm: 12, md: 14, lg: 18 }
const FONT_SIZE: Record<ButtonSize, number> = { sm: 12, md: 13, lg: 13 }

/**
 * Filled variants keep white text whatever family they are in: white on blue and white
 * on red read the same over glass as over a window of ours, and it is the background
 * that `tokens.css` darkens on hover rather than the whole control, which would drag the
 * label's contrast down with it.
 *
 * The two tones take different blues, which is not drift. `--accent` is measured against
 * dark glass in the capture overlays; `--focus` equals the report's own, because a
 * primary button in the home window sits a few pixels from the report's active tab.
 */
function paint(variant: ButtonVariant, tone: ButtonTone, danger: boolean): CSSProperties {
  const glass = tone === 'glass'
  if (variant === 'primary') {
    return {
      border: 'none',
      background: glass ? 'var(--accent)' : 'var(--focus)',
      color: 'var(--on-dark)'
    }
  }
  if (variant === 'danger') {
    return { border: 'none', background: 'var(--danger)', color: 'var(--on-dark)' }
  }
  if (variant === 'secondary') {
    return glass
      ? {
          border: '1px solid var(--glass-edge)',
          background: 'var(--glass-fill)',
          color: 'var(--on-dark-2)'
        }
      : {
          border: '1px solid var(--surface-edge)',
          background: 'var(--surface-raised)',
          color: danger ? 'var(--danger)' : 'var(--ink-2)'
        }
  }
  // Ghost: no edge until it is hovered, so a row of them reads as one surface.
  return {
    border: '1px solid transparent',
    background: 'transparent',
    color: glass ? 'var(--on-dark-3)' : 'var(--ink-2)'
  }
}

export type ButtonProps = {
  variant?: ButtonVariant
  tone?: ButtonTone
  size?: ButtonSize
  /** Leading icon. With `children` it sits before the label; without, see `label`. */
  icon?: IconName
  /** Trailing icon, for a button whose meaning is "and then somewhere else". */
  iconAfter?: IconName
  /**
   * A destructive secondary: red ink, and `tokens.css` turns the whole control red on
   * hover. Only meaningful on `secondary` — a filled `danger` is already the loud one.
   */
  danger?: boolean
  /** Required when there is no visible label, so the control still has an accessible name. */
  label?: string
  children?: ReactNode
  /**
   * Merged last, and meant for where the button sits rather than what it looks like —
   * a margin, a `flex`, an `alignSelf`. A button that needs its own colours here is one
   * that wants a variant.
   */
  style?: CSSProperties
  /**
   * React 19 hands a function component its `ref` as an ordinary prop, so this needs no
   * `forwardRef` — it rides through the rest spread onto the button. `Menu` uses it to
   * put focus back on the trigger when the sheet closes.
   */
  ref?: Ref<HTMLButtonElement>
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'style' | 'ref'>

export function Button({
  variant = 'secondary',
  tone = 'window',
  size = 'md',
  icon,
  iconAfter,
  danger = false,
  label,
  children,
  style: layout,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  const iconOnly = children === undefined || children === null || children === false
  const iconSize = size === 'sm' ? 15 : 16

  // A link takes no size: it sits in a sentence and matches whatever that sentence is
  // set in, so a height and a padding would only knock the line out of alignment.
  const shape: CSSProperties =
    variant === 'link'
      ? {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: 0,
          border: 'none',
          background: 'none',
          // Ink rather than the brand: red is for a filled action and for severity, and
          // a red link put a third meaning on the same colour until nothing read as
          // emphatic.
          color: tone === 'glass' ? 'var(--on-dark)' : 'var(--ink)',
          textDecoration: 'underline',
          textDecorationColor: 'var(--ink-3)',
          textUnderlineOffset: 3,
          font: 'inherit',
          fontWeight: 600
        }
      : {
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: HEIGHT[size],
          ...(iconOnly ? { width: HEIGHT[size], padding: 0 } : { padding: `0 ${PADDING[size]}px` }),
          borderRadius: tone === 'glass' ? 'var(--r-lg)' : 'var(--r-md)',
          font: `600 ${FONT_SIZE[size]}px var(--font)`,
          whiteSpace: 'nowrap',
          ...paint(variant, tone, danger)
        }

  const style: CSSProperties = {
    ...shape,
    cursor: rest.disabled ? 'default' : 'pointer',
    ...(rest.disabled ? { opacity: 0.45 } : {})
  }

  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      type={type}
      data-btn={variant}
      data-tone={tone}
      data-danger={danger || undefined}
      style={{ ...style, ...layout }}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {/* Pushed to the far edge on a button wider than its label — a chevron hugging the
          text reads as part of it rather than as the thing that opens the menu. */}
      {iconAfter && (
        <span style={{ display: 'flex', marginLeft: 'auto' }}>
          <Icon name={iconAfter} size={iconSize} />
        </span>
      )}
    </button>
  )
}
