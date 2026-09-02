import type { Settings } from '@preload/index'
import type { IconName } from '@renderer/components/Icon'
import { hotkeyKeys } from '@renderer/lib/hotkey'

/**
 * The things snapit is for, as one list.
 *
 * It exists because the shell shipped with exactly one capture button in it — "Capture a
 * web app" — and the other three modes were reachable only by global hotkey or the tray.
 * A capture tool whose window cannot start a capture is a viewer, and the landing surface
 * of one is a poster. The hotkeys are still the fast path; this is the surface for
 * somebody who is already looking at the app, or who does not know the chords yet.
 *
 * One list, two renderers: the top bar shows the set compactly on every route, the
 * Overview shows it with the chords spelled out. Those disagreeing about what snapit can
 * do would be the exact drift this file prevents.
 *
 * Chords are read from settings rather than hard-coded, because they are editable and a
 * button that teaches the wrong shortcut is worse than one that teaches none.
 */

export type CaptureActionKey = 'web' | 'screenshot' | 'record' | 'gif' | 'image'

export type CaptureAction = {
  key: CaptureActionKey
  label: string
  icon: IconName
  /** What it gets you, for the Overview and the tooltip. */
  hint: string
  /** Display glyphs for the chord, when there is one. */
  keys: string[]
  /**
   * The loud one. Capturing a web app is the only mode that collects the console, the
   * network and the steps, and it is the only one that genuinely needs the app — the
   * other three are one keystroke away from anywhere.
   */
  primary?: boolean
  /** Not a capture: an image that already exists, opened to annotate. */
  aside?: boolean
  run: () => void
}

export function captureActions(settings: Settings | null): CaptureAction[] {
  const keys = (accelerator: string | undefined): string[] => (accelerator ? hotkeyKeys(accelerator) : [])

  return [
    {
      key: 'web',
      label: 'Capture a web app',
      icon: 'globe',
      hint: 'A browser snapit collects from: console, network, steps, video, and your mic.',
      keys: [],
      primary: true,
      run: () => window.snapit.startWebCapture()
    },
    {
      key: 'screenshot',
      label: 'Screenshot',
      icon: 'image',
      hint: 'Freeze the screen, drag a region, annotate, copy or save.',
      keys: keys(settings?.screenshotHotkey),
      run: () => window.snapit.startCapture('screenshot')
    },
    {
      key: 'record',
      label: 'Record',
      icon: 'film',
      hint: 'A screen or a window, with system audio and your microphone.',
      keys: keys(settings?.recordHotkey),
      run: () => window.snapit.startCapture('record')
    },
    {
      key: 'gif',
      label: 'Record silently',
      icon: 'mute',
      hint: 'No audio, and an MP4 or GIF toggle for wherever it is going.',
      keys: keys(settings?.gifHotkey),
      run: () => window.snapit.startCapture('gif')
    },
    {
      key: 'image',
      label: 'Open an image',
      icon: 'pen',
      hint: 'Annotate or redact a picture you already have.',
      keys: [],
      aside: true,
      run: () => void window.snapit.openImageToEdit()
    }
  ]
}

/** The three that go in the top bar beside the primary: a capture, not a file. */
export const isBarAction = (a: CaptureAction): boolean => !a.primary && !a.aside
