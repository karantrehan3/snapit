import type { CSSProperties, ReactElement } from 'react'
import { COLORS, TOOLS, type Tool } from './types'

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  onCopy: () => void
  onCancel: () => void
  style: CSSProperties
}

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCopy,
  onCancel,
  style
}: Props): ReactElement {
  const isPreset = COLORS.includes(color)

  return (
    <div style={{ ...barStyle, ...style }}>
      {TOOLS.map((t) => (
        <button key={t.tool} title={t.title} onClick={() => setTool(t.tool)} style={btn(tool === t.tool)}>
          {t.tool === 'move' ? <MoveIcon /> : t.label}
        </button>
      ))}
      <span style={sep} />
      {COLORS.map((c) => (
        <button key={c} title={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />
      ))}
      <label title="Custom color" style={customSwatch(!isPreset, color)}>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>
      <span style={sep} />
      <button title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} style={btn(false, !canUndo)}>
        ↶
      </button>
      <button title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} style={btn(false, !canRedo)}>
        ↷
      </button>
      <button title="Copy to clipboard" onClick={onCopy} style={action('#0a84ff')}>
        Copy
      </button>
      <button title="Cancel (Esc)" onClick={onCancel} style={action('#48484a')}>
        ✕
      </button>
    </div>
  )
}

/** Four-directional move arrows. */
function MoveIcon(): ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="9 6 12 3 15 6" />
      <polyline points="9 18 12 21 15 18" />
      <polyline points="6 9 3 12 6 15" />
      <polyline points="18 9 21 12 18 15" />
    </svg>
  )
}

const barStyle: CSSProperties = {
  position: 'fixed',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 8px',
  background: 'rgba(30, 30, 32, 0.95)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  font: '14px -apple-system, system-ui, sans-serif'
}

const sep: CSSProperties = { width: 1, height: 22, background: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }

function btn(active: boolean, disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    color: '#fff',
    fontSize: 15,
    opacity: disabled ? 0.4 : 1,
    background: active ? '#0a84ff' : 'rgba(255, 255, 255, 0.08)'
  }
}

function swatch(color: string, active: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
    background: color,
    border: active ? '2px solid #fff' : '2px solid rgba(255, 255, 255, 0.25)'
  }
}

/** Custom-color swatch: a rainbow ring with the picked color in the center. */
function customSwatch(active: boolean, color: string): CSSProperties {
  return {
    position: 'relative',
    display: 'inline-block',
    width: 22,
    height: 22,
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
    boxShadow: active ? `inset 0 0 0 4px ${color}, 0 0 0 2px #fff` : 'inset 0 0 0 4px rgba(0,0,0,0.25)'
  }
}

function action(bg: string): CSSProperties {
  return {
    height: 28,
    padding: '0 12px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: bg
  }
}
