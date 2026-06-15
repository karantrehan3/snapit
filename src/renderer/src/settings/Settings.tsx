import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { Settings as SettingsType } from '../../../preload/index'
import { HotkeyInput } from './HotkeyInput'

/**
 * Settings window: edit the capture hotkeys and the default save folder.
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

      <Field label="Save folder">
        <input readOnly value={settings.saveDir} style={inputStyle} />
        <button type="button" onClick={() => void browse()} style={browseStyle}>
          Browse…
        </button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: '#6b6b70', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  )
}

const pageStyle: CSSProperties = {
  padding: 24,
  fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  color: '#1c1c1e',
  background: '#f5f5f7',
  height: '100vh',
  boxSizing: 'border-box'
}

const inputStyle: CSSProperties = {
  flex: 1,
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  color: '#1c1c1e',
  font: '13px -apple-system, system-ui, sans-serif'
}

const browseStyle: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
}

const saveStyle: CSSProperties = {
  height: 32,
  padding: '0 18px',
  borderRadius: 6,
  border: 'none',
  background: '#0a84ff',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
}

const closeStyle: CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 6,
  border: '1px solid #c7c7cc',
  background: '#fff',
  cursor: 'pointer',
  font: '13px -apple-system, system-ui, sans-serif'
}
