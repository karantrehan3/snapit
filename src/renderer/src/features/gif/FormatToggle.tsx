import type { ReactElement } from 'react'
import type { SilentFormat } from './useGifRecorder'
import { barSegmented, segment } from '../record/styles'

/**
 * MP4 / GIF segmented toggle for the silent-capture command bar.
 *
 * MP4 leads because it is smaller at better quality by a wide margin — GIF has no lossy
 * transform, no motion compensation and a 256-colour palette per frame. GIF stays available
 * for the places that still insist on it.
 */
export function FormatToggle({
  format,
  onChange
}: {
  format: SilentFormat
  onChange: (f: SilentFormat) => void
}): ReactElement {
  return (
    <div style={barSegmented}>
      <button
        type="button"
        onClick={() => onChange('mp4')}
        style={segment(format === 'mp4')}
        title="Silent MP4 — roughly 8x smaller than GIF at better quality"
      >
        MP4
      </button>
      <button
        type="button"
        onClick={() => onChange('gif')}
        style={segment(format === 'gif')}
        title="GIF — much larger, for destinations that require the format"
      >
        GIF
      </button>
    </div>
  )
}
