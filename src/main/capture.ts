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
