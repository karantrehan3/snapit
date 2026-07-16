import type { ReactElement } from 'react'
import type { SizePreview as SizePreviewState } from './types'
import { sizePreviewCircle, sizePreviewLabel, sizePreviewWrap } from './styles'

/**
 * Transient badge shown while ⌘/Ctrl+scroll changes stroke thickness: a circle at
 * the pointer sized to the current stroke, with the value in px. Shared by every
 * annotation surface; renders nothing when there is no active preview.
 */
export function SizePreview({ preview }: { preview: SizePreviewState | null }): ReactElement | null {
  if (!preview) return null
  return (
    <div style={sizePreviewWrap(preview.x, preview.y)}>
      <div style={sizePreviewCircle(preview.size)} />
      <div style={sizePreviewLabel}>{preview.size}px</div>
    </div>
  )
}
