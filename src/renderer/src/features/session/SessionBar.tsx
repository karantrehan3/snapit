import { useEffect, useRef, type ReactElement } from 'react'
import { Icon } from '@renderer/components/Icon'
import type { SessionPhase } from '@preload/index'
import { useBarPointer } from './useBarPointer'
import { actions, bar, copy, detail, headline, primary, secondary, statusDot, warning } from './styles'

/**
 * What is on screen while snapit collects from a browser it launched.
 *
 * These controls used to live in the tray menu, which meant the only sign that snapit
 * was recording everything a browser did was a menu item you had to go looking for —
 * and starting the capture, the one action with a right moment, was three clicks away
 * from the moment it belonged to. Both now sit where the work is happening.
 *
 * The two phases are the whole point of the component. Setup is collected and thrown
 * away, so the bar has to say so: someone who believes their sign-in is being recorded
 * behaves differently from someone who knows it is not.
 */
export function SessionBar({
  phase,
  videoUnavailable,
  onReady
}: {
  phase: SessionPhase
  /** The browser window could not be identified, so this capture has no video. */
  videoUnavailable?: boolean
  onReady?: () => void
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const capturing = phase === 'capturing'
  useBarPointer(ref, true)

  useEffect(() => {
    const raf = requestAnimationFrame(() => onReady?.())
    return () => cancelAnimationFrame(raf)
  }, [onReady])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <div ref={ref} style={bar}>
        <div style={copy}>
          <span style={headline}>
            <span style={statusDot(capturing)} />
            {capturing ? 'Capturing this web app' : 'Getting ready'}
          </span>
          <span style={videoUnavailable ? warning : detail}>
            {videoUnavailable
              ? 'Console, network and steps only — the browser window could not be found to record.'
              : capturing
                ? 'Console, network, steps and video. Stop when the bug has happened.'
                : 'Sign in and get to where the bug starts. Nothing is kept until you start.'}
          </span>
        </div>

        <div style={actions}>
          {capturing ? (
            <button type="button" style={primary} onClick={() => window.snapit.stopWebCapture()}>
              <Icon name="stop" size={12} />
              Stop and save
            </button>
          ) : (
            <>
              <button
                type="button"
                style={secondary}
                onClick={() => window.snapit.stopWebCapture()}
                title="Ends the session now and saves whatever setup collected"
              >
                Stop
              </button>
              <button type="button" style={primary} onClick={() => window.snapit.beginWebCapture()}>
                <span style={{ fontSize: 10 }}>●</span> Start capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
