import type { ReactElement } from 'react'
import type { Mode } from './types'
import { barSegmented, segment } from './styles'

/** Full / Region segmented toggle for the command bar (shared by record + gif). */
export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }): ReactElement {
  return (
    <div style={barSegmented}>
      <button type="button" onClick={() => onChange('full')} style={segment(mode === 'full')}>
        Full
      </button>
      <button type="button" onClick={() => onChange('region')} style={segment(mode === 'region')}>
        Region
      </button>
    </div>
  )
}
