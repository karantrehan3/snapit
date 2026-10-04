import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ExtensionStatus } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Panel, panelBody } from '@renderer/components/Panel'
import { Stat, StatStrip } from '@renderer/components/StatStrip'
import { sectionHead, sectionTitle } from './styles'

/**
 * Setting up the Chrome collector.
 *
 * It exists as a surface because the install cannot be automated and never will be:
 * Chrome 137 removed `--load-extension` from branded builds, so snapit can neither
 * side-load the extension nor check a box on anybody's behalf. What is left is three
 * steps a person does once, and the honest thing is to show them rather than bury them
 * in a README nobody opens.
 *
 * The alternative — a snapit-launched browser — still works and still ships. This page
 * says so, because somebody who does not want to install anything should know they are
 * not missing the product.
 */
export function BrowserExtension(): ReactElement {
  const [status, setStatus] = useState<ExtensionStatus | null>(null)
  const [pairingUntil, setPairingUntil] = useState(0)

  const refresh = useCallback(() => void window.snapit.extensionStatus().then(setStatus), [])

  useEffect(() => {
    refresh()
    // Polled, because none of it is an event this window sees: a person loads a folder in
    // another application, and the extension pairs over a socket.
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [refresh])

  const openPairing = (): void => {
    void window.snapit.allowExtensionPairing().then(({ until }) => {
      setPairingUntil(until)
      refresh()
    })
  }

  const pairingOpen = status?.pairing === true || pairingUntil > Date.now()

  return (
    <>
      <StatStrip>
        <Stat
          label="Extension"
          value={status?.available ? 'Ready to load' : 'Not in this build'}
          note={status?.id ? status.id.slice(0, 12) + '…' : 'built with the app'}
        />
        <Stat
          label="Pairing"
          value={pairingOpen ? 'Open' : 'Closed'}
          note={pairingOpen ? 'the extension may collect its token' : 'open it while you install'}
        />
        <Stat
          label="Recording"
          value={status?.recording ? 'In progress' : 'Idle'}
          note="started from the browser, not here"
        />
      </StatStrip>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Record the browser you are already signed in to</h2>
        </div>
        <p style={prose}>
          snapit can launch its own Chrome, and that still works — but it is a fresh profile, so you sign in
          to whatever you are testing again, every time. The extension collects from the tab you are already
          in: your session, your cookies, your extensions.
        </p>
        <ol style={steps}>
          <Step n={1} title="Open the extension folder">
            <Button
              size="sm"
              icon="folder"
              onClick={() => window.snapit.revealExtension()}
              disabled={!status?.available}
            >
              Reveal folder
            </Button>
          </Step>
          <Step n={2} title="Load it in Chrome">
            Go to <code style={code}>chrome://extensions</code>, turn on <b>Developer mode</b>, then
            <b> Load unpacked</b> and pick that folder. Chrome will not let snapit do this for you — the flag
            that allowed it was removed in Chrome 137.
          </Step>
          <Step n={3} title="Let it pair">
            <Button size="sm" icon="globe" onClick={openPairing} disabled={!status?.available}>
              {pairingOpen ? 'Pairing is open' : 'Open pairing for 5 minutes'}
            </Button>
          </Step>
        </ol>
        <p style={prose}>
          Then click the snapit button in Chrome&rsquo;s toolbar on any tab. It shows <b>REC</b> while it is
          collecting, and this window will say so too.
        </p>
      </section>

      <Panel tone="warning" icon="alert" heading="Chrome will say it is being debugged">
        <p style={panelBody}>
          A yellow bar appears on the tab while snapit collects, because the extension uses Chrome&rsquo;s
          debugger to read the network and the console. It cannot be turned off for an extension you loaded
          yourself, and it will appear in screen recordings. Deploying the extension by enterprise policy
          removes it; nothing else does.
        </p>
      </Panel>

      <Panel tone="neutral" icon="info" heading="It does not update itself">
        <p style={panelBody}>
          An extension loaded this way is a folder, not an install — updating snapit does not update it. After
          an update, open <code style={code}>chrome://extensions</code> and press Reload on snapit collector.
          snapit refuses a session from a version it does not recognise rather than recording a short one.
        </p>
      </Panel>
    </>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }): ReactElement {
  return (
    <li style={step}>
      <span style={stepNum}>{n}</span>
      <div>
        <div style={stepTitle}>{title}</div>
        <div style={stepBody}>{children}</div>
      </div>
    </li>
  )
}

const prose: CSSProperties = {
  margin: '0 0 14px',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.6,
  maxWidth: '62ch'
}

const steps: CSSProperties = {
  listStyle: 'none',
  margin: '0 0 14px',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 14
}

const step: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start' }

const stepNum: CSSProperties = {
  flex: 'none',
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: '1px solid var(--rule)',
  display: 'grid',
  placeItems: 'center',
  font: '600 var(--t-tiny) var(--mono)',
  color: 'var(--ink-2)'
}

const stepTitle: CSSProperties = { font: '600 var(--t-small) var(--sans)', marginBottom: 6 }

const stepBody: CSSProperties = {
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.6,
  maxWidth: '58ch'
}

const code: CSSProperties = { font: 'var(--t-small) var(--mono)', color: 'var(--focus)' }
