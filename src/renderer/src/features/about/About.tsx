import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { UpdateInfo } from '@preload/index'
import { APP_ICON } from './appIcon'

const REPO = 'https://github.com/karantrehan3/snapit'
const SITE = 'https://karantrehan3.github.io'
const ISSUES = 'https://github.com/karantrehan3/snapit/issues'

/**
 * About window: app identity + version and developer info, with links that open
 * in the user's browser (via the main process, never in-app). Checks GitHub for a
 * newer release on open (download is a manual last step — see updater.ts).
 */
export function About(): ReactElement {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(true)
  const [checked, setChecked] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  const runCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      setUpdate(await window.snapit.checkForUpdate())
    } finally {
      setChecked(true)
      setChecking(false)
    }
  }

  useEffect(() => {
    void window.snapit.getAppInfo().then((info) => setVersion(info.version))
    void runCheck()
  }, [])

  const open = (url: string) => (): void => window.snapit.openExternal(url)

  return (
    <div style={page}>
      <img src={APP_ICON} alt="snapit" style={badge} />

      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 14 }}>snapit</div>
      <div style={versionPill}>{version ? `v${version}` : '—'}</div>
      <p style={tagline}>Local-only screenshots, screen recording &amp; GIFs — from your menu bar.</p>

      <div style={divider} />

      <div style={{ fontSize: 12, color: '#8e8e93' }}>Made by</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>Karan Trehan</div>

      <div style={linkRow}>
        <button type="button" style={linkBtn} onClick={open(SITE)}>
          🌐 Website
        </button>
        <button type="button" style={linkBtn} onClick={open(REPO)}>
          ★ GitHub
        </button>
        <button type="button" style={linkBtn} onClick={open(ISSUES)}>
          ⚑ Report a bug
        </button>
      </div>

      {checking ? (
        <div style={updateMuted}>Checking for updates…</div>
      ) : update ? (
        <div style={updateBox}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Update available — v{update.version}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <button type="button" style={updateBtn} onClick={open(update.downloadUrl)}>
              Download
            </button>
            <button type="button" style={linkBtn} onClick={open(update.notesUrl)}>
              Release notes
            </button>
          </div>
        </div>
      ) : checked ? (
        <div style={updateMuted}>
          You&apos;re on the latest version ✓ ·{' '}
          <button type="button" style={inlineLink} onClick={() => void runCheck()}>
            Check again
          </button>
        </div>
      ) : (
        <button type="button" style={{ ...updateBtn, marginTop: 16 }} onClick={() => void runCheck()}>
          Check for updates →
        </button>
      )}

      <div style={footer}>© Karan Trehan · MIT License · Nothing leaves your machine.</div>
    </div>
  )
}

const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '28px 24px',
  height: '100vh',
  boxSizing: 'border-box',
  fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  color: '#1c1c1e',
  background: '#f5f5f7',
  userSelect: 'none'
}

const badge: CSSProperties = {
  width: 84,
  height: 84,
  objectFit: 'contain',
  borderRadius: 20,
  boxShadow: '0 8px 22px rgba(0, 0, 0, 0.18)'
}

const versionPill: CSSProperties = {
  marginTop: 6,
  padding: '2px 10px',
  borderRadius: 999,
  background: '#e5e5ea',
  color: '#3a3a3c',
  fontSize: 12,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums'
}

const tagline: CSSProperties = {
  margin: '12px 0 0',
  maxWidth: 300,
  fontSize: 13,
  lineHeight: 1.5,
  color: '#48484a'
}

const divider: CSSProperties = {
  width: '100%',
  height: 1,
  margin: '22px 0',
  background: '#d8d8dc'
}

const linkRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 14,
  flexWrap: 'wrap',
  justifyContent: 'center'
}

const linkBtn: CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid #d0d0d4',
  background: '#fff',
  color: '#1c1c1e',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  font: '12px -apple-system, system-ui, sans-serif'
}

const updateBtn: CSSProperties = {
  height: 34,
  padding: '0 18px',
  borderRadius: 8,
  border: 'none',
  background: '#0a84ff',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer'
}

const updateBox: CSSProperties = {
  marginTop: 16,
  padding: '12px 14px',
  borderRadius: 10,
  background: '#eef6ff',
  border: '1px solid #cfe4ff',
  width: '100%',
  boxSizing: 'border-box'
}

const updateMuted: CSSProperties = { marginTop: 16, fontSize: 12, color: '#8e8e93' }

const inlineLink: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#0a84ff',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer'
}

const footer: CSSProperties = {
  marginTop: 'auto',
  paddingTop: 18,
  fontSize: 11,
  color: '#8e8e93'
}
