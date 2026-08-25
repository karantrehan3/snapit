import { useState, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { Icon } from '@renderer/components/Icon'
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
        <button
          key={t.tool}
          title={t.title}
          aria-label={t.title}
          aria-pressed={tool === t.tool}
          onClick={() => setTool(t.tool)}
          style={btn(tool === t.tool)}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      <span style={toolbarSep} />
      {/* Redactions ignore the palette, so the mode toggle takes the colours' place. */}
      {tool === 'redact' &&
        REDACT_MODES.map((m) => (
          <button
            key={m.mode}
            title={m.title}
            aria-label={m.title}
            aria-pressed={redactMode === m.mode}
            onClick={() => setRedactMode(m.mode)}
            style={btn(redactMode === m.mode)}
          >
            <Icon name={m.icon} />
          </button>
        ))}
      {tool !== 'redact' &&
        COLORS.map((c) => (
          <button
            key={c}
            title={colorName(c)}
            aria-label={colorName(c)}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={swatch(c, color === c)}
          />
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
                title={colorName(c)}
                aria-label={colorName(c)}
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
      <button
        title="Undo (⌘Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        style={btn(false, !canUndo)}
      >
        <Icon name="undo" />
      </button>
      <button
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        style={btn(false, !canRedo)}
      >
        <Icon name="redo" />
      </button>
      <button title="Copy to clipboard" onClick={onCopy} style={action('#0a84ff')}>
        Copy
      </button>

      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button title={saveTitle} onClick={onSave} style={splitMain('#34c759')}>
          {saveLabel}
        </button>
        <button
          title={saveAsLabel}
          aria-label={saveAsLabel}
          aria-expanded={saveMenu}
          onClick={() => setSaveMenu((m) => !m)}
          style={splitChevron('#2da14e')}
        >
          <Icon name="chevron-down" size={13} />
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

      <button title="Cancel (Esc)" aria-label="Cancel" onClick={onCancel} style={action('#48484a')}>
        <Icon name="close" />
      </button>
    </div>
  )
}

/** Swatches announced themselves as '#ffcc00'; a name is what someone is looking for. */
function colorName(hex: string): string {
  return NAMED[hex.toLowerCase()] ?? hex
}

const NAMED: Record<string, string> = {
  '#ff3b30': 'Red',
  '#ffcc00': 'Yellow',
  '#34c759': 'Green',
  '#0a84ff': 'Blue',
  '#ffffff': 'White',
  '#1c1c1e': 'Black'
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
