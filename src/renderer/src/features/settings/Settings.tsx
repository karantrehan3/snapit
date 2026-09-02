import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { Settings as SettingsType } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Field, inputStyle } from '@renderer/components/Field'
import { HotkeyInput } from './HotkeyInput'
import { pageStyle } from './styles'

/**
 * Settings window: edit the capture hotkeys, the default save folder, and whether
 * recordings are saved as bundles.
 * Persisted via the main process (settings.json in userData).
 */
export function Settings(): ReactElement {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.snapit.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div style={pageStyle}>Loading…</div>

  const patch = (p: Partial<SettingsType>): void => {
    setSettings({ ...settings, ...p })
    setSaved(false)
  }

  const browse = async (): Promise<void> => {
    const dir = await window.snapit.browseDir()
    if (dir) patch({ saveDir: dir })
  }

  const save = async (): Promise<void> => {
    await window.snapit.setSettings(settings)
    setSaved(true)
  }

  return (
    <div style={pageStyle}>
      <Field label="Screenshot hotkey">
        <HotkeyInput value={settings.screenshotHotkey} onChange={(v) => patch({ screenshotHotkey: v })} />
      </Field>

      <Field label="Record hotkey">
        <HotkeyInput value={settings.recordHotkey} onChange={(v) => patch({ recordHotkey: v })} />
      </Field>

      <Field label="GIF hotkey">
        <HotkeyInput value={settings.gifHotkey} onChange={(v) => patch({ gifHotkey: v })} />
      </Field>

      <Field label="Save folder">
        <input readOnly value={settings.saveDir} style={inputStyle} />
        <Button size="sm" onClick={() => void browse()}>
          Browse…
        </Button>
      </Field>

      <Field
        label="Recordings"
        hint="Keeps the recording with a details page you can open in any browser. The video file itself is named exactly as it would be on its own."
      >
        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={settings.bundleRecordings}
            onChange={(e) => patch({ bundleRecordings: e.target.checked })}
          />
          Save as a report folder
        </label>
      </Field>

      {/* The record bar has these too, but a web capture starts itself and never shows
          one — so this was the only audio setting with nowhere to be changed. */}
      <Field
        label="Audio"
        hint="Used by every recording, including a web app capture, which starts without a setup bar to ask you."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={settings.capture.mic}
              onChange={(e) => patch({ capture: { ...settings.capture, mic: e.target.checked } })}
            />
            Your microphone — narrate the bug while you reproduce it
          </label>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={settings.capture.systemAudio}
              onChange={(e) => patch({ capture: { ...settings.capture, systemAudio: e.target.checked } })}
            />
            System audio — whatever the machine is playing
          </label>
        </div>
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <Button variant="primary" onClick={() => void save()}>
          Save
        </Button>
        <Button onClick={() => window.close()}>Close</Button>
        {saved && <span style={{ color: 'var(--success)', fontSize: 'var(--t-body)' }}>Saved ✓</span>}
      </div>
    </div>
  )
}

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 'var(--t-body)',
  cursor: 'pointer'
}
