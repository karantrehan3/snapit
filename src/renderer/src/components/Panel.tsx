import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * A tinted surface that carries a meaning.
 *
 * The permission card on first run is amber while the permission is missing and green
 * once it is granted; the update box in About is blue. All three were hand-mixed from
 * the same four ingredients — a tint, a border on the tint, a heading, and sometimes a
 * round icon badge — and the tints themselves were literals rather than tokens, which
 * is how `rgba(255, 179, 64, 0.1)` came to exist in one file and `#e8952a` in another.
 *
 * `tone` names what the panel is saying, not what colour it is. That matters when the
 * same panel changes meaning while someone is looking at it, which is exactly what the
 * permission card does.
 */

export type PanelTone = 'neutral' | 'accent' | 'warning' | 'success' | 'danger'

const TINT: Record<PanelTone, CSSProperties> = {
  neutral: { background: 'var(--surface-raised)', borderColor: 'var(--surface-edge)' },
  accent: { background: 'var(--accent-tint)', borderColor: 'var(--accent-soft-edge)' },
  warning: { background: 'var(--warning-soft)', borderColor: 'var(--warning-soft-edge)' },
  success: { background: 'var(--success-soft)', borderColor: 'var(--success-soft-edge)' },
  danger: { background: 'var(--danger-soft)', borderColor: 'var(--danger-soft-edge)' }
}

/** The badge is filled, so it needs a colour of its own rather than the tint's. */
const BADGE: Record<PanelTone, string> = {
  neutral: 'var(--ink-3)',
  accent: 'var(--accent)',
  warning: 'var(--warning-strong)',
  success: 'var(--success)',
  danger: 'var(--danger)'
}

export function Panel({
  tone = 'neutral',
  icon,
  heading,
  children,
  style
}: {
  tone?: PanelTone
  /** Rendered as a filled round badge before the heading. Needs a heading to sit beside. */
  icon?: IconName
  heading?: ReactNode
  children?: ReactNode
  style?: CSSProperties
}): ReactElement {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        padding: '14px 16px',
        borderRadius: 'var(--r-lg)',
        border: '1px solid',
        color: 'var(--ink)',
        ...TINT[tone],
        ...style
      }}
    >
      {heading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            fontSize: 'var(--t-strong)',
            fontWeight: 600
          }}
        >
          {icon && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: BADGE[tone],
                color: 'var(--on-dark)'
              }}
            >
              <Icon name={icon} size={15} />
            </span>
          )}
          {heading}
        </div>
      )}
      {children}
    </div>
  )
}

/** Body copy inside a panel: quieter than the heading, and readable at length. */
export const panelBody: CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.55
}
