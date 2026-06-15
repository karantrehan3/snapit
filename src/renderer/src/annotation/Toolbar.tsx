import type { CSSProperties, ReactElement } from 'react'
import { COLORS, SIZES, TOOLS, type Tool } from './types'

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
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
  strokeWidth,
  setStrokeWidth,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCopy,
  onCancel,
  style
}: Props): ReactElement {
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
      <span style={sep} />
      {SIZES.map((s, i) => (
        <button key={s} title={`Thickness ${s}`} onClick={() => setStrokeWidth(s)} style={btn(strokeWidth === s)}>
          <span
            style={{
              display: 'inline-block',
              width: 4 + i * 4,
              height: 4 + i * 4,
              borderRadius: '50%',
              background: tool === 'text' ? '#fff' : color
            }}
          />
        </button>
      ))}
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
