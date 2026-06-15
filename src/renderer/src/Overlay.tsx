import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import type { CaptureSession } from '@preload/index'

// Lazy per mode so the screenshot path's Konva bundle (~1.4 MB) loads only when a
// screenshot overlay actually renders — the record overlay never pulls it in.
const ScreenshotOverlay = lazy(() =>
  import('@renderer/features/screenshot/ScreenshotOverlay').then((m) => ({ default: m.ScreenshotOverlay }))
)
const RecordOverlay = lazy(() =>
  import('@renderer/features/record/RecordOverlay').then((m) => ({ default: m.RecordOverlay }))
)

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
  return (
    <Suspense fallback={null}>
      {session.mode === 'screenshot' ? (
        <ScreenshotOverlay frame={session.frame} />
      ) : (
        <RecordOverlay source={session.source} />
      )}
    </Suspense>
  )
}
