import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { ScreenPermission } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Icon, type IconName } from '@renderer/components/Icon'
import { KeyCap, keyRow } from '@renderer/components/KeyCap'
import { Panel, panelBody } from '@renderer/components/Panel'
import { actions, card, done, hotkey, hotkeyRow, intro, page, sectionLabel, title, what } from './styles'

/**
 * First run.
 *
 * The design doc listed missing Screen Recording permission as the highest risk in the
 * product and named first-launch onboarding as the mitigation. It was never built, so
 * the failure it predicted is exactly what happened: press the hotkey, get black
 * frames, with nothing anywhere saying why.
 *
 * So this window has one real job — get the permission granted, or at least explain
 * what will go wrong without it. The rest is the three hotkeys, which are the whole
 * interface and are otherwise only discoverable by opening a menu in the tray.
 */
export function Welcome(): ReactElement {
  const [permission, setPermission] = useState<ScreenPermission>('unknown')

  const check = useCallback(() => {
    void window.snapit.screenPermission().then(setPermission)
  }, [])

  useEffect(() => {
    check()
    // Granting happens in System Settings, in another application, so there is no event
    // to wait on — the window re-checks whenever it comes back to the front.
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [check])

  const granted = permission === 'granted'

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>snapit</h1>
        <p style={intro}>
          Captures on this machine and nothing leaves it. A capture becomes a folder holding the recording,
          what the console and network did, and a page you can send to whoever needs it.
        </p>

        {/* The panel changes meaning while someone is looking at it, which is why the
            tone is derived rather than fixed. */}
        <Panel
          tone={granted ? 'success' : 'warning'}
          icon={granted ? 'check' : 'alert'}
          heading={granted ? 'Screen Recording is on' : 'snapit needs Screen Recording'}
        >
          <p style={panelBody}>
            {granted
              ? 'Everything works. You can close this and press a hotkey whenever you need one.'
              : 'macOS will not let any application see the screen without it, and snapit cannot tell the difference between a screen it may not read and a black one — so captures come out black with nothing to explain why.'}
          </p>
          {!granted && (
            <div style={actions}>
              <Button variant="primary" onClick={() => window.snapit.openScreenSettings()}>
                Open System Settings
              </Button>
              <Button onClick={check}>Check again</Button>
            </div>
          )}
        </Panel>

        <p style={sectionLabel}>The three hotkeys</p>
        <Hotkey
          icon="image"
          keys={['⌘', '⇧', '9']}
          label="Screenshot"
          hint="Select, annotate, copy or save."
        />
        <Hotkey icon="film" keys={['⌘', '⇧', '8']} label="Record" hint="Screen or window, with audio." />
        <Hotkey icon="mute" keys={['⌘', '⇧', '7']} label="Record silently" hint="MP4 or GIF, no audio." />

        <p style={what}>
          Everything else lives in the tray: capturing a web app, the library of what you have made, and
          settings.
        </p>

        <div style={done}>
          <Button variant="primary" onClick={() => window.snapit.finishWelcome()}>
            {granted ? 'Start using snapit' : 'Continue anyway'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Hotkey({
  icon,
  keys,
  label,
  hint
}: {
  icon: IconName
  keys: string[]
  label: string
  hint: string
}): ReactElement {
  return (
    <div style={hotkeyRow}>
      <span style={{ ...keyRow, ...hotkey }}>
        {keys.map((k) => (
          <KeyCap key={k}>{k}</KeyCap>
        ))}
      </span>
      <Icon name={icon} size={15} />
      <span>
        <b>{label}</b> — {hint}
      </span>
    </div>
  )
}
