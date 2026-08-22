import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { Settings as SettingsType } from '@preload/index'
import { HotkeyInput } from './HotkeyInput'
import { browseStyle, closeStyle, inputStyle, pageStyle, saveStyle } from './styles'

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
      <h2 style={{ margin: '0 0 16px', fontSize: 17 }}>snapit Settings</h2>

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
        <button type="button" onClick={() => void browse()} style={browseStyle}>
          Browse…
        </button>
      </Field>

      <Field label="Recordings">
        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={settings.bundleRecordings}
            onChange={(e) => patch({ bundleRecordings: e.target.checked })}
          />
          <span>
            Save as a report folder
            <span style={hintStyle}>
              Keeps the recording with a details page you can open in any browser. The video file itself is
              named exactly as it would be on its own.
            </span>
          </span>
        </label>
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <button type="button" onClick={() => void save()} style={saveStyle}>
          Save
        </button>
        <button type="button" onClick={() => window.close()} style={closeStyle}>
          Close
        </button>
        {saved && <span style={{ color: '#34c759', fontSize: 13 }}>Saved ✓</span>}
      </div>
    </div>
  )
}

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer'
}

const hintStyle: CSSProperties = { display: 'block', color: '#6b6b70', fontSize: 12, marginTop: 3 }

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: '#6b6b70', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  )
}
