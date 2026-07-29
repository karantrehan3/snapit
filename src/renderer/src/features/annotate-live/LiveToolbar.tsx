import { useState, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { COLORS, MAX_STROKE, MIN_STROKE, PALETTE } from '../annotate/types'
import {
  palettePopover,
  paletteSwatch,
  toolbarAction,
  toolbarBar,
  toolbarBtn,
  toolbarCustomSwatch,
  toolbarSep,
  toolbarSwatch
} from '../annotate/styles'
import { LIVE_TOOLS } from './types'
import type { LiveAnnotations } from './useLiveAnnotations'
import { strokeRange } from './styles'

type Props = {
  anno: LiveAnnotations
  style: CSSProperties
  /** Attach for measurement, so placement can use the real width (see useToolbarPlacement). */
  barRef: RefObject<HTMLDivElement | null>
}

/**
 * Draw-mode tool strip.
 *
 * Shares the screenshot toolbar's chrome and colour picker so marking up a recording
 * looks and behaves like marking up a screenshot. Only the actions differ, and only
 * where the surface forces it: a live recording has nothing to undo, copy or save-as,
 * no `move` tool (shapes are ephemeral and inert, so there's nothing to select), and
 * no `text` tool (typing needs keyboard focus, which would fight the app being
 * recorded). It gains a thickness slider, since Cmd+Scroll has no visible affordance
 * and there's no size preview mid-recording.
 *
 * `data-no-draw` keeps clicks here — including in the colour popover — from starting a
 * stroke on the canvas beneath, and being plain DOM keeps it out of the recording.
 */
export function LiveToolbar({ anno, style, barRef }: Props): ReactElement {
  const [colorMenu, setColorMenu] = useState(false)
  const isPreset = COLORS.includes(anno.color)

  return (
    <div ref={barRef} style={{ ...toolbarBar, ...style }} data-no-draw>
      {LIVE_TOOLS.map((t) => (
        <button
          key={t.tool}
          title={t.title}
          aria-label={t.title}
          aria-pressed={anno.tool === t.tool}
          onClick={() => anno.setTool(t.tool)}
          style={toolbarBtn(anno.tool === t.tool)}
        >
          {t.label}
        </button>
      ))}

      <span style={toolbarSep} />
      {COLORS.map((c) => (
        <button
          key={c}
          title={c}
          aria-label={`Colour ${c}`}
          aria-pressed={anno.color === c}
          onClick={() => anno.setColor(c)}
          style={toolbarSwatch(c, anno.color === c)}
        />
      ))}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          title="More colors"
          aria-label="More colours"
          onClick={() => setColorMenu((m) => !m)}
          style={toolbarCustomSwatch(!isPreset, anno.color)}
        />
        {colorMenu && (
          <div style={palettePopover}>
            {PALETTE.map((c) => (
              <button
                key={c}
                title={c}
                aria-label={`Colour ${c}`}
                onClick={() => {
                  anno.setColor(c)
                  setColorMenu(false)
                }}
                style={paletteSwatch(c, anno.color === c)}
              />
            ))}
          </div>
        )}
      </div>

      <span style={toolbarSep} />
      <input
        type="range"
        min={MIN_STROKE}
        max={MAX_STROKE}
        value={anno.strokeWidth}
        onChange={(e) => anno.setStrokeWidth(Number(e.target.value))}
        style={strokeRange}
        title="Thickness"
        aria-label="Stroke thickness"
      />

      <span style={toolbarSep} />
      <button
        title="Clear all (Backspace)"
        aria-label="Clear all annotations"
        onClick={anno.clear}
        style={toolbarAction('#48484a')}
      >
        ⌫ Clear
      </button>
    </div>
  )
}
