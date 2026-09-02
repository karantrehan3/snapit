import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { Button, type ButtonSize, type ButtonTone, type ButtonVariant } from '@renderer/components/Button'
import { Chip } from '@renderer/components/Chip'
import { Field, inputStyle } from '@renderer/components/Field'
import { Findings } from '@renderer/components/Findings'
import { Stat, StatFigure, StatStrip } from '@renderer/components/StatStrip'
import { KeyCap, keyRow } from '@renderer/components/KeyCap'
import { Panel, panelBody, type PanelTone } from '@renderer/components/Panel'
import { Icon, type IconName } from '@renderer/components/Icon'

/**
 * Every shared component, in every state, in both families.
 *
 * This exists because the drift it is here to catch was not caught by anybody looking
 * at the app: the nine buttons that preceded `Button.tsx` were each correct on the
 * screen they lived on, and their disagreement was only visible if you held two windows
 * side by side. Nobody does that. This page does.
 *
 * Both tones are shown because snapit really has two: chrome floating over someone
 * else's screen, and windows of its own. The glass rows sit on a dark backdrop rather
 * than on the page, since a translucent control on an opaque surface is not the control
 * anyone will see — its edge and its blur are half of what it is.
 *
 * Reachable at `#gallery`, and from the tray in development.
 */
export function Gallery(): ReactElement {
  return (
    <div style={page}>
      <header style={header}>
        <h1 style={{ margin: 0, fontSize: 'var(--t-title)', letterSpacing: '-0.01em' }}>Components</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-2)', fontSize: 'var(--t-small)' }}>
          Every state of every shared component, in whichever scheme the system is set to. If two of these
          stop matching, it shows up here first — switch macOS between light and dark to check both.
        </p>
      </header>

      <Section title="Button, in our own windows">
        {VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size === 'md' ? 'Save' : size}
              </Button>
            ))}
            <Button variant={variant} icon="share">
              With icon
            </Button>
            <Button variant={variant} iconAfter="chevron-down">
              Trailing
            </Button>
            <Button variant={variant} icon="folder" label="Icon only" />
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </Row>
        ))}
        <Row label="destructive secondary">
          <Button variant="secondary" danger icon="trash" label="Move to Trash" />
          <Button variant="secondary" danger icon="trash">
            Move to Trash
          </Button>
          <Button variant="secondary" danger disabled icon="trash">
            Move to Trash
          </Button>
        </Row>
      </Section>

      <Glass title="Button, on chrome over someone else's screen">
        {VARIANTS.map((variant) => (
          <Row key={variant} label={variant} dark>
            {SIZES.map((size) => (
              <Button key={size} variant={variant} tone="glass" size={size}>
                {size === 'md' ? 'Stop' : size}
              </Button>
            ))}
            <Button variant={variant} tone="glass" icon="stop">
              Stop and save
            </Button>
            <Button variant={variant} tone="glass" icon="mic" label="Microphone" />
            <Button variant={variant} tone="glass" disabled>
              Disabled
            </Button>
          </Row>
        ))}
      </Glass>

      <Section title="Chip">
        <Row label="window">
          <Chip selected={false}>All</Chip>
          <Chip selected>All</Chip>
          <Chip selected={false} count={12}>
            With problems
          </Chip>
          <Chip selected count={12}>
            With problems
          </Chip>
          <Chip selected={false} count={0}>
            Web sessions
          </Chip>
        </Row>
      </Section>

      <Glass title="Chip, on glass">
        <Row label="glass" dark>
          <Chip selected={false} tone="glass">
            All
          </Chip>
          <Chip selected tone="glass">
            All
          </Chip>
          <Chip selected={false} tone="glass" count={12}>
            With problems
          </Chip>
        </Row>
      </Glass>

      <Section title="Findings">
        <Row label="two counts">
          <Findings consoleErrors={7} failedRequests={5} />
        </Row>
        <Row label="one of each">
          <Findings consoleErrors={1} failedRequests={0} />
          <Findings consoleErrors={0} failedRequests={1} />
        </Row>
        <Row label="compact">
          <Findings consoleErrors={7} failedRequests={5} compact />
        </Row>
        <Row label="none">
          <Findings consoleErrors={0} failedRequests={0} />
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            a clean capture renders nothing here, not an empty row
          </span>
        </Row>
      </Section>

      <Section title="StatStrip">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <StatStrip>
            <Stat label="Capturing" value="Nothing right now" />
            <Stat label="Last capture" value="15:40" />
            <Stat label="Save folder" note="55 captures">
              <Button variant="link" icon="folder">
                2.7 GB
              </Button>
            </Stat>
          </StatStrip>
          <StatStrip>
            <StatFigure label="Captures" value="55" note="2 web · 52 recordings · 1 screenshot" />
            <StatFigure label="Requests seen" value="520" note="22 failed" tone="bad" />
            <StatFigure label="Console errors" value="37" tone="bad" note="6 captures with findings" />
            <StatFigure label="On disk" value="2.7 GB" note="since 16 Jun" />
          </StatStrip>
        </div>
      </Section>

      <Section title="Panel">
        <div
          style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
        >
          {PANEL_TONES.map(([tone, icon, heading]) => (
            <Panel key={tone} tone={tone} icon={icon} heading={heading}>
              <p style={panelBody}>
                Tone <code>{tone}</code>. The heading and the badge are the panel&apos;s; the copy is whatever
                it is wrapping.
              </p>
            </Panel>
          ))}
          <Panel tone="neutral" heading="Heading, no badge">
            <p style={panelBody}>A panel with a heading and no icon.</p>
          </Panel>
          <Panel tone="accent">
            <p style={{ ...panelBody, margin: 0 }}>Body only — no heading, no badge.</p>
          </Panel>
        </div>
      </Section>

      <Section title="Field">
        <div style={{ maxWidth: 420 }}>
          <Field label="Save folder">
            <input readOnly value="~/Pictures/snapit" style={inputStyle} />
            <Button size="sm">Browse…</Button>
          </Field>
          <Field label="Screenshot hotkey" hint="Click the field, then press the keys you want.">
            <span style={{ ...keyRow, gap: 4 }}>
              <KeyCap>⌘</KeyCap>
              <KeyCap>⇧</KeyCap>
              <KeyCap>9</KeyCap>
            </span>
          </Field>
          <Field
            label="Recordings"
            hint="Keeps the recording with a details page you can open in any browser."
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 'var(--t-body)',
                cursor: 'pointer'
              }}
            >
              <input type="checkbox" defaultChecked />
              Save as a report folder
            </label>
          </Field>
        </div>
      </Section>

      <Section title="KeyCap">
        <Row label="single">
          <KeyCap>⌘</KeyCap>
          <KeyCap>⇧</KeyCap>
          <KeyCap>9</KeyCap>
          <KeyCap>Space</KeyCap>
        </Row>
        <Row label="held">
          <KeyCap held>⌘</KeyCap>
          <KeyCap held>⇧</KeyCap>
        </Row>
        <Row label="chord">
          <span style={keyRow}>
            <KeyCap>⌘</KeyCap>
            <KeyCap>⇧</KeyCap>
            <KeyCap>M</KeyCap>
          </span>
          <span style={keyRow}>
            <KeyCap>⌘⇧9</KeyCap>
          </span>
        </Row>
      </Section>

      <Section title="Icon">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {ICONS.map((name) => (
            <span key={name} style={iconCell} title={name}>
              <Icon name={name} size={20} />
              <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>{name}</span>
            </span>
          ))}
        </div>
      </Section>
    </div>
  )
}

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'danger', 'ghost', 'link']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

const PANEL_TONES: [PanelTone, IconName, string][] = [
  ['neutral', 'image', 'Nothing is wrong'],
  ['accent', 'share', 'Update available'],
  ['warning', 'alert', 'snapit needs Screen Recording'],
  ['success', 'check', 'Screen Recording is on'],
  ['danger', 'alert', 'That capture could not be read']
]

const ICONS: IconName[] = [
  'move',
  'rect',
  'ellipse',
  'arrow',
  'line',
  'pen',
  'text',
  'redact',
  'redact-solid',
  'redact-pixelate',
  'undo',
  'redo',
  'close',
  'chevron-down',
  'chevron-right',
  'speaker',
  'mic',
  'flag',
  'stop',
  'play',
  'grip',
  'globe',
  'star',
  'film',
  'image',
  'list',
  'folder',
  'trash',
  'clipboard',
  'share',
  'alert',
  'check',
  'mute',
  'external'
]

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section style={{ padding: '18px 22px', borderTop: '1px solid var(--surface-edge)' }}>
      <h2 style={sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

/** A section whose specimens need something behind them to be the thing they are. */
function Glass({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section style={{ padding: '18px 22px', borderTop: '1px solid var(--surface-edge)' }}>
      <h2 style={sectionTitle}>{title}</h2>
      <div style={backdrop}>{children}</div>
    </section>
  )
}

function Row({
  label,
  children,
  dark
}: {
  label: string
  children: ReactNode
  dark?: boolean
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
      <span style={{ ...rowLabel, color: dark ? 'var(--on-dark-3)' : 'var(--ink-3)' }}>{label}</span>
      {children}
    </div>
  )
}

const page: CSSProperties = {
  height: '100vh',
  overflowY: 'auto',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'var(--t-body) var(--font)'
}

const header: CSSProperties = {
  padding: '20px 22px 16px',
  background: 'var(--surface-raised)'
}

const sectionTitle: CSSProperties = {
  margin: '0 0 14px',
  font: '600 var(--t-small) var(--font)',
  color: 'var(--ink-2)'
}

/**
 * Sans, not monospace. A specimen label is prose, and setting it in the face reserved
 * for values that have to line up in a column is the habit this page exists to catch.
 */
const rowLabel: CSSProperties = { width: 130, flex: 'none', font: '600 var(--t-micro) var(--font)' }

/**
 * Stands in for someone else's screen. A gradient rather than a flat dark fill, because
 * a flat one hides exactly the failure glass chrome has — an edge that disappears where
 * the thing behind it happens to be the same brightness.
 */
const backdrop: CSSProperties = {
  padding: '18px 16px 6px',
  borderRadius: 'var(--r-lg)',
  background: 'linear-gradient(135deg, #1d2733 0%, #4a5568 45%, #8a94a6 100%)'
}

const iconCell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  width: 74,
  padding: '8px 2px',
  borderRadius: 'var(--r-md)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-edge)',
  color: 'var(--ink-2)'
}
