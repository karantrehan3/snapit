import { useState, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { COLORS, PALETTE, REDACT_MODES, TOOLS, type RedactMode, type Tool } from './types'
import {
  palettePopover,
  paletteSwatch,
  toolbarAction as action,
  toolbarBar as barStyle,
  toolbarBtn as btn,
  toolbarCustomSwatch as customSwatch,
  toolbarSep,
  toolbarSwatch as swatch
} from './styles'

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  redactMode: RedactMode
  setRedactMode: (m: RedactMode) => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  onCopy: () => void
  onSave: () => void
  onSaveAs: () => void
  onCancel: () => void
  style: CSSProperties
  /** Attach for measurement, so placement can use the real width (see useToolbarPlacement). */
  barRef?: RefObject<HTMLDivElement | null>
  /** Primary save button label/tooltip (image edit overrides to "overwrite original"). */
  saveLabel?: string
  saveTitle?: string
  /** Secondary save action label (image edit demotes "Overwrite original" here). */
  saveAsLabel?: string
  /** Tooltip for the secondary save action (e.g. warn that it overwrites the file). */
  saveAsTitle?: string
  /** Which way the save dropdown opens ('up' for a bottom-docked toolbar). Default 'down'. */
  menuPlacement?: 'up' | 'down'
}

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  redactMode,
  setRedactMode,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCopy,
  onSave,
  onSaveAs,
  onCancel,
  style,
  barRef,
  saveLabel = 'Save',
  saveTitle = 'Save to folder',
  saveAsLabel = 'Save As…',
  saveAsTitle,
  menuPlacement = 'down'
}: Props): ReactElement {
  const [saveMenu, setSaveMenu] = useState(false)
  const [colorMenu, setColorMenu] = useState(false)
  const isPreset = COLORS.includes(color)

  return (
    <div ref={barRef} style={{ ...barStyle, ...style }}>
      {TOOLS.map((t) => (
        <button key={t.tool} title={t.title} onClick={() => setTool(t.tool)} style={btn(tool === t.tool)}>
          {t.tool === 'move' ? <MoveIcon /> : t.label}
        </button>
      ))}
      <span style={toolbarSep} />
      {/* Redactions ignore the palette, so the mode toggle takes the colours' place. */}
      {tool === 'redact' &&
        REDACT_MODES.map((m) => (
          <button
            key={m.mode}
            title={m.title}
            onClick={() => setRedactMode(m.mode)}
            style={btn(redactMode === m.mode)}
          >
            {m.label}
          </button>
        ))}
      {tool !== 'redact' &&
        COLORS.map((c) => (
          <button key={c} title={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />
        ))}
      <div style={{ position: 'relative', display: 'inline-flex', ...(tool === 'redact' && hidden) }}>
        <button
          title="More colors"
          onClick={() => setColorMenu((m) => !m)}
          style={customSwatch(!isPreset, color)}
        />
        {colorMenu && (
          <div style={palettePopover}>
            {PALETTE.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => {
                  setColor(c)
                  setColorMenu(false)
                }}
                style={paletteSwatch(c, color === c)}
              />
            ))}
          </div>
        )}
      </div>
      <span style={toolbarSep} />
      <button title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} style={btn(false, !canUndo)}>
        ↶
      </button>
      <button title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} style={btn(false, !canRedo)}>
        ↷
      </button>
      <button title="Copy to clipboard" onClick={onCopy} style={action('#0a84ff')}>
        Copy
      </button>

      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button title={saveTitle} onClick={onSave} style={splitMain('#34c759')}>
          {saveLabel}
        </button>
        <button title={saveAsLabel} onClick={() => setSaveMenu((m) => !m)} style={splitChevron('#2da14e')}>
          ▾
        </button>
        {saveMenu && (
          <div style={menuStyle(menuPlacement)}>
            <button
              title={saveAsTitle}
              onClick={() => {
                setSaveMenu(false)
                onSaveAs()
              }}
              style={menuItemStyle}
            >
              {saveAsLabel}
            </button>
          </div>
        )}
      </div>

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

function splitMain(bg: string): CSSProperties {
  return { ...action(bg), borderRadius: '6px 0 0 6px', paddingRight: 10 }
}

function splitChevron(bg: string): CSSProperties {
  return { ...action(bg), borderRadius: '0 6px 6px 0', padding: '0 8px', fontSize: 11 }
}

function menuStyle(placement: 'up' | 'down'): CSSProperties {
  // 'up' for a bottom-docked toolbar (image editor) so the menu isn't clipped by
  // the window edge; 'down' for the screenshot toolbar that floats near the top.
  const vertical = placement === 'up' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }
  return {
    position: 'absolute',
    left: 0,
    ...vertical,
    background: 'rgba(40, 40, 42, 0.98)',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    zIndex: 10
  }
}

/** The custom-colour popover has no meaning for redactions. */
const hidden: CSSProperties = { display: 'none' }

const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 14px',
  border: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: 13,
  textAlign: 'left',
  whiteSpace: 'nowrap',
  cursor: 'pointer'
}
