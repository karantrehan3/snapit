import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '@renderer/components/Button'
import { Icon } from '@renderer/components/Icon'
import type { CapturePrefs, SessionPhase } from '@preload/index'
// The record bar's own toggles. Shared rather than copied: this is the same kind of
// object floating over someone else's screen, and two glass bars that style their
// controls differently look like two applications.
import { barDivider, iconToggle } from '../record/styles'
import { useBarPointer } from './useBarPointer'
import { actions, audioGroup, bar, copy, detail, headline, statusDot, warning } from './styles'

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
  prefs,
  videoUnavailable,
  onReady
}: {
  phase: SessionPhase
  /** How the audio was left last time. See main/capturePrefs.ts. */
  prefs: CapturePrefs
  /** The browser window could not be identified, so this capture has no video. */
  videoUnavailable?: boolean
  onReady?: () => void
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const capturing = phase === 'capturing'
  const [systemAudio, setSystemAudio] = useState(prefs.systemAudio)
  const [mic, setMic] = useState(prefs.mic)
  useBarPointer(ref, true)

  useEffect(() => {
    const raf = requestAnimationFrame(() => onReady?.())
    return () => cancelAnimationFrame(raf)
  }, [onReady])

  /**
   * Save, then start — in that order, and awaited.
   *
   * A web capture records itself: main reads the saved prefs at the moment it starts, so
   * a toggle that has not landed in settings yet is a toggle the recording never sees.
   *
   * Saving on Start rather than on each toggle is the record bar's rule, for the record
   * bar's reason: pressing it is the moment someone means it, and a session they
   * abandoned should not change what the next one opens with.
   */
  const startCapture = async (): Promise<void> => {
    await window.snapit.setSettings({ capture: { ...prefs, systemAudio, mic } })
    window.snapit.beginWebCapture()
  }

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
            <Button
              variant="danger"
              tone="glass"
              size="lg"
              icon="stop"
              onClick={() => window.snapit.stopWebCapture()}
            >
              Stop and save
            </Button>
          ) : (
            <>
              {/* The recording starts on its own, so this bar is the only place the
                  audio can be chosen — the record bar's toggles are never shown. */}
              <div style={audioGroup}>
                <button
                  type="button"
                  style={iconToggle(systemAudio)}
                  onClick={() => setSystemAudio((v) => !v)}
                  title="System audio — whatever the machine is playing"
                  aria-label="System audio"
                  aria-pressed={systemAudio}
                >
                  <Icon name="speaker" size={17} />
                </button>
                <button
                  type="button"
                  style={iconToggle(mic)}
                  onClick={() => setMic((v) => !v)}
                  title="Microphone — narrate the bug while you reproduce it"
                  aria-label="Microphone"
                  aria-pressed={mic}
                >
                  <Icon name="mic" size={17} />
                </button>
              </div>
              <div style={barDivider} />
              <Button
                tone="glass"
                size="lg"
                onClick={() => window.snapit.stopWebCapture()}
                title="Ends the session now and saves whatever setup collected"
              >
                Stop
              </Button>
              {/* Red before anything is being kept, because pressing it is what starts
                  keeping it — the colour is about the consequence, not the state. */}
              <Button variant="danger" tone="glass" size="lg" onClick={() => void startCapture()}>
                <span style={{ fontSize: 10 }}>●</span> Start capture
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
