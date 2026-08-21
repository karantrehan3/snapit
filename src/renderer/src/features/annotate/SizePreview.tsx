import type { ReactElement } from 'react'
import type { SizePreview as SizePreviewState } from './types'
import { sizePreviewCircle, sizePreviewGlyph, sizePreviewLabel, sizePreviewWrap } from './styles'

/**
 * Transient badge shown while ⌘/Ctrl+scroll changes a size: a circle at the pointer
 * for stroke thickness, a specimen glyph for font size — a 96px circle says nothing
 * about how big the type will be. Shared by every annotation surface; renders
 * nothing when there is no active preview.
 */
export function SizePreview({ preview }: { preview: SizePreviewState | null }): ReactElement | null {
  if (!preview) return null
  return (
    <div style={sizePreviewWrap(preview.x, preview.y)}>
      {preview.kind === 'font' ? (
        <div style={sizePreviewGlyph(preview.size)}>Aa</div>
      ) : (
        <div style={sizePreviewCircle(preview.size)} />
      )}
      <div style={sizePreviewLabel}>{preview.size}px</div>
    </div>
  )
}
