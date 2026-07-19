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
const GifOverlay = lazy(() =>
  import('@renderer/features/gif/GifOverlay').then((m) => ({ default: m.GifOverlay }))
)

/**
 * Overlay container.
 *
 * Fetches the current capture session and routes to the mode-specific overlay.
 * Each mode lives in its own component so screenshot and record stay isolated.
 */
export function Overlay(): ReactElement | null {
  const [session, setSession] = useState<CaptureSession | null>(null)
  // Bumped per capture to remount the mode overlay with clean state (window is reused).
  const [captureKey, setCaptureKey] = useState(0)

  useEffect(() => {
    const apply = (s: CaptureSession | null): void => {
      setSession(s)
      if (s) setCaptureKey((k) => k + 1)
    }
    // Reused window: main pushes each new session (or null on dismiss) over IPC.
    const unsub = window.snapit.onSession(apply)
    // Cover the first capture, in case the session was set before this mounted.
    void window.snapit.getSession().then((s) => {
      if (s) apply(s)
    })
    return unsub
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
  // Main reveals the hidden window only once we report the frame has painted.
  const onReady = (): void => window.snapit.signalOverlayReady()
  return (
    <Suspense key={captureKey} fallback={null}>
      {session.mode === 'screenshot' ? (
        <ScreenshotOverlay frame={session.frame} onReady={onReady} />
      ) : session.mode === 'gif' ? (
        <GifOverlay source={session.source} onReady={onReady} />
      ) : (
        <RecordOverlay source={session.source} onReady={onReady} />
      )}
    </Suspense>
  )
}
