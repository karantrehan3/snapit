import { desktopCapturer, type Display } from 'electron'

/**
 * Capture a full-resolution still of the given display.
 *
 * The thumbnail is requested at the display's true pixel size (DIP × scaleFactor)
 * so annotations and crops land on a sharp, Retina-accurate image rather than a
 * downscaled one.
 */
export async function captureDisplay(display: Display): Promise<string> {
  const { scaleFactor, bounds } = display
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(bounds.width * scaleFactor),
      height: Math.round(bounds.height * scaleFactor)
    }
  })

  if (sources.length === 0) {
    throw new Error('No screen sources returned (is Screen Recording permission granted?)')
  }

  // Match the source to the captured display; fall back to the first screen.
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]

  return source.thumbnail.toDataURL()
}

export type DisplaySource = { id: string; width: number; height: number }

/**
 * Resolve the desktopCapturer source id for a display, plus its true pixel size.
 *
 * The renderer feeds the id to getUserMedia (chromeMediaSourceId) to open a live
 * screen stream; width/height let it constrain capture to native resolution.
 */
export async function getDisplaySource(display: Display): Promise<DisplaySource> {
  const { scaleFactor, bounds } = display
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  if (sources.length === 0) {
    throw new Error('No screen sources returned (is Screen Recording permission granted?)')
  }
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  return {
    id: source.id,
    width: Math.round(bounds.width * scaleFactor),
    height: Math.round(bounds.height * scaleFactor)
  }
}
