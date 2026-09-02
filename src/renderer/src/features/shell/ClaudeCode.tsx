import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { ShellStatus } from '@preload/index'
import { Button } from '@renderer/components/Button'
import { Panel, panelBody } from '@renderer/components/Panel'
import { StatStrip, Stat } from '@renderer/components/StatStrip'
import { mcpDetail } from '@renderer/lib/mcp'
import { sectionHead, sectionTitle } from './styles'

/**
 * Connecting an agent to what snapit has captured.
 *
 * This was two items in a tray submenu — "Copy setup command" and "Regenerate token…" —
 * which meant the one thing worth explaining had nowhere to be explained. The value of
 * the MCP server is not that it exists; it is that an agent can read the console error
 * and the failed request without being told about them, and that it never leaves this
 * machine to do it.
 */
export function ClaudeCode({ status }: { status: ShellStatus | null }): ReactElement {
  const [command, setCommand] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.snapit.mcpSetupCommand().then(setCommand)
  }, [])

  const copy = (): void => {
    window.snapit.copyText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const connection = mcpDetail(status?.mcp ?? { state: 'never' })

  return (
    <>
      <StatStrip>
        <Stat label="Connection" value={connection.value} note={connection.note} />
        <Stat label="Server" value="Local only" note="loopback, bearer-token gated" />
        <Stat label="Tools" value="6" note="captures, console, network, steps" />
      </StatStrip>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>Add snapit to Claude Code</h2>
        </div>
        <p style={prose}>
          Run this once in any project. Claude Code can then see your captures — the console errors, the
          failed requests, the steps you took — without you pasting anything.
        </p>
        <div style={commandBox}>
          <code style={commandText}>{command || 'Loading…'}</code>
          <Button size="sm" icon="clipboard" onClick={copy} disabled={!command}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </section>

      <section>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>What it can read</h2>
        </div>
        <dl style={tools}>
          <Tool name="recent_captures" what="What you have captured lately, newest first." />
          <Tool name="get_session_summary" what="One capture: what it collected and where its files are." />
          <Tool
            name="get_console_errors"
            what="The console, with identical messages collapsed into one line and a count."
          />
          <Tool
            name="get_failed_requests"
            what="Only the requests that failed, with their response bodies."
          />
          <Tool name="get_steps" what="One line per action; ask again with a step for its detail." />
          <Tool
            name="start_browser_session / stop"
            what="Drive a collecting browser without touching the tray."
          />
        </dl>
      </section>

      <Panel tone="warning" icon="alert" heading="The token is a key to this machine">
        <p style={panelBody}>
          Anything holding it can read every capture in the save folder. Regenerating invalidates the old one
          and disconnects whatever is using it, so you will need to re-run the setup command.
        </p>
        <div style={{ marginTop: 12 }}>
          <Button danger icon="undo" onClick={() => void window.snapit.regenerateMcpToken()}>
            Regenerate token…
          </Button>
        </div>
      </Panel>
    </>
  )
}

function Tool({ name, what }: { name: string; what: string }): ReactElement {
  return (
    <div style={toolRow}>
      <dt style={toolName}>{name}</dt>
      <dd style={toolWhat}>{what}</dd>
    </div>
  )
}

const prose: CSSProperties = {
  margin: '0 0 12px',
  maxWidth: '62ch',
  color: 'var(--ink-2)',
  fontSize: 'var(--t-body)',
  lineHeight: 1.6
}

const commandBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-sunken)'
}

const commandText: CSSProperties = {
  flex: 1,
  minWidth: 0,
  font: 'var(--t-small) var(--mono)',
  color: 'var(--ink)',
  overflowX: 'auto',
  whiteSpace: 'nowrap'
}

const tools: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  borderTop: '1px solid var(--rule)'
}

const toolRow: CSSProperties = {
  display: 'flex',
  gap: 14,
  alignItems: 'baseline',
  padding: '7px 2px',
  borderBottom: '1px solid var(--rule)'
}

const toolName: CSSProperties = {
  flex: 'none',
  width: 214,
  font: '600 var(--t-small) var(--mono)',
  color: 'var(--focus)'
}

const toolWhat: CSSProperties = {
  margin: 0,
  color: 'var(--ink-2)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.5
}
