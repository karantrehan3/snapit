import { screen } from 'electron'
import type { DisplayInfo } from './bundle'

/** Every connected display, in the shape bundle metadata records them. */
export function currentDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primaryId
  }))
}
