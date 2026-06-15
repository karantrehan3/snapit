import { useEffect, useState, type ReactElement } from 'react'
import type { CaptureSession } from '../../preload/index'
import { ScreenshotOverlay } from './ScreenshotOverlay'
import { RecordOverlay } from './RecordOverlay'

/**
 * Overlay container.
 *
 * Fetches the current capture session and routes to the mode-specific overlay.
 * Each mode lives in its own component so screenshot and record stay isolated.
 */
export function Overlay(): ReactElement | null {
  const [session, setSession] = useState<CaptureSession | null>(null)

  useEffect(() => {
    void window.snapit.getSession().then(setSession)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.snapit.closeOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!session) return null
  if (session.mode === 'screenshot') return <ScreenshotOverlay frame={session.frame} />
  return <RecordOverlay />
}
