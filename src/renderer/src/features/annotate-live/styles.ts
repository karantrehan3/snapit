import type { CSSProperties } from 'react'

/**
 * Live-only chrome. Everything else comes from `annotate/styles.ts` so the draw-mode
 * toolbar matches the screenshot one.
 */

/** Thickness slider — live drawing has no size preview, so the control is visible. */
export const strokeRange: CSSProperties = { width: 76, accentColor: 'var(--accent)', cursor: 'pointer' }
