import { useEffect, useState, type ReactElement } from 'react'
import type { CaptureSession } from '@preload/index'
import { ScreenshotOverlay } from '@renderer/features/screenshot/ScreenshotOverlay'
import { RecordOverlay } from '@renderer/features/record/RecordOverlay'

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
    // Record mode manages its own Esc (Esc must not discard an active recording).
    if (session?.mode !== 'screenshot') return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.snapit.closeOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])

  if (!session) return null
  if (session.mode === 'screenshot') return <ScreenshotOverlay frame={session.frame} />
  return <RecordOverlay source={session.source} />
}
