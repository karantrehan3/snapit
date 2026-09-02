import { useEffect, useState } from 'react'

/**
 * A capture's thumbnail, fetched per caller rather than per list.
 *
 * Per row, and never for a whole list at once: a thumbnail goes through the OS thumbnail
 * service, and awaiting forty of those would hold up the window painting at all. So each
 * row asks for its own and renders without one until it arrives.
 *
 * Returns null while it is loading and null if it never arrives — those are the same
 * thing to a caller, because every surface that shows one is built to work without it.
 *
 * Existed twice before this: once in the capture list and once in the Overview's resume
 * card, character for character.
 */
export function useThumbnail(mediaPath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!mediaPath) return
    let live = true
    void window.snapit.captureThumbnail(mediaPath).then((next) => {
      if (live) setUrl(next)
    })
    return () => {
      live = false
    }
  }, [mediaPath])

  return url
}
