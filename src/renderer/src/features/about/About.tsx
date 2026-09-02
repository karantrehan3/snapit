import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { UpdateInfo } from '@preload/index'
import { APP_ICON } from '@renderer/lib/appIcon'
import { Button } from '@renderer/components/Button'
import { Panel } from '@renderer/components/Panel'

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

      <div style={{ fontSize: 'var(--t-figure)', fontWeight: 700, marginTop: 14 }}>snapit</div>
      <div style={versionPill}>{version ? `v${version}` : '—'}</div>
      <p style={tagline}>Local-only screenshots, screen recording &amp; GIFs — from your menu bar.</p>

      <div style={divider} />

      <div style={{ fontSize: 'var(--t-small)', color: 'var(--ink-3)' }}>Made by</div>
      <div style={{ fontSize: 'var(--t-strong)', fontWeight: 600, marginTop: 2 }}>Karan Trehan</div>

      <div style={linkRow}>
        <Button icon="globe" onClick={open(SITE)}>
          Website
        </Button>
        <Button icon="star" onClick={open(REPO)}>
          GitHub
        </Button>
        <Button icon="flag" onClick={open(ISSUES)}>
          Report a bug
        </Button>
      </div>

      {checking ? (
        <div style={updateMuted}>Checking for updates…</div>
      ) : update ? (
        <Panel tone="accent" style={{ marginTop: 16, width: '100%', textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
            Update available — v{update.version}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <Button variant="primary" size="lg" onClick={open(update.downloadUrl)}>
              Download
            </Button>
            <Button onClick={open(update.notesUrl)}>Release notes</Button>
          </div>
        </Panel>
      ) : checked ? (
        <div style={updateMuted}>
          You&apos;re on the latest version ✓ ·{' '}
          <Button variant="link" onClick={() => void runCheck()}>
            Check again
          </Button>
        </div>
      ) : (
        <Button variant="primary" size="lg" style={{ marginTop: 16 }} onClick={() => void runCheck()}>
          Check for updates
        </Button>
      )}

      <div style={footer}>© Karan Trehan · MIT License · Nothing leaves your machine.</div>
    </div>
  )
}

/** A route, not a window: the shell owns the ground, the scrolling and the padding. */
const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  maxWidth: 380,
  userSelect: 'none'
}

/**
 * The radius is here for the shadow, which follows the border box rather than the
 * artwork's alpha. 19 is the macOS squircle's own corner at this size (22.5% of the
 * mark), so the two now agree — before the icon was cropped, this drew a rounded
 * rectangle floating four pixels clear of the logo inside it.
 */
const badge: CSSProperties = {
  width: 84,
  height: 84,
  objectFit: 'contain',
  borderRadius: 19,
  boxShadow: '0 8px 22px rgba(0, 0, 0, 0.18)'
}

const versionPill: CSSProperties = {
  marginTop: 6,
  padding: '2px 10px',
  borderRadius: 999,
  background: 'var(--surface-sunken)',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums'
}

const tagline: CSSProperties = {
  margin: '12px 0 0',
  maxWidth: 300,
  fontSize: 'var(--t-body)',
  lineHeight: 1.5,
  color: 'var(--ink-2)'
}

const divider: CSSProperties = {
  width: '100%',
  height: 1,
  margin: '22px 0',
  background: 'var(--surface-edge)'
}

const linkRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 14,
  flexWrap: 'wrap',
  justifyContent: 'center'
}

const updateMuted: CSSProperties = { marginTop: 16, fontSize: 'var(--t-small)', color: 'var(--ink-3)' }

const footer: CSSProperties = {
  paddingTop: 18,
  fontSize: 'var(--t-micro)',
  color: 'var(--ink-3)'
}
