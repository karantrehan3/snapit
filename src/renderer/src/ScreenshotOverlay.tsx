import { useRef, useState, type ReactElement } from 'react'
import type { Frame } from '../../preload/index'

type Rect = { x: number; y: number; w: number; h: number }

const MIN_SELECTION = 4

/**
 * Screenshot capture overlay (Phase 1b).
 *
 * Shows the frozen full-screen frame, dims it, and lets the user drag a
 * selection rectangle (Lightshot-style: the selected area stays bright while
 * everything outside is dimmed). On release the selection is cropped at native
 * resolution and copied to the clipboard. Annotation tools (1c) build on this.
 */
export function ScreenshotOverlay({ frame }: { frame: Frame }): ReactElement {
  const [selection, setSelection] = useState<Rect | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const onMouseDown = (e: React.MouseEvent): void => {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setSelection({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    const start = dragStart.current
    if (!start) return
    setSelection({
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x),
      h: Math.abs(e.clientY - start.y)
    })
  }

  const onMouseUp = async (): Promise<void> => {
    dragStart.current = null
    if (!selection || selection.w < MIN_SELECTION || selection.h < MIN_SELECTION) {
      setSelection(null)
      return
    }
    const cropped = await cropToDataUrl(frame, selection)
    window.snapit.copyImage(cropped)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={() => void onMouseUp()}
      style={{ position: 'fixed', inset: 0, cursor: 'crosshair', userSelect: 'none' }}
    >
      <img
        src={frame.dataUrl}
        draggable={false}
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }}
      />

      {selection ? (
        <div
          style={{
            position: 'fixed',
            left: selection.x,
            top: selection.y,
            width: selection.w,
            height: selection.h,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
            border: '1px solid #4aa3ff',
            pointerEvents: 'none'
          }}
        />
      ) : (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.45)', pointerEvents: 'none' }}
        />
      )}

      {!selection && <div style={hintStyle}>Drag to select · Esc to cancel</div>}

      {selection && selection.w > 0 && (
        <div
          style={{
            position: 'fixed',
            left: selection.x,
            top: Math.max(0, selection.y - 22),
            color: '#fff',
            background: 'rgba(0, 0, 0, 0.65)',
            padding: '1px 6px',
            font: '12px -apple-system, system-ui, sans-serif',
            borderRadius: 3,
            pointerEvents: 'none'
          }}
        >
          {Math.round(selection.w)} × {Math.round(selection.h)}
        </div>
      )}
    </div>
  )
}

const hintStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  color: '#fff',
  font: '14px -apple-system, system-ui, sans-serif',
  opacity: 0.85,
  pointerEvents: 'none'
}

/** Crop the frozen frame to the selection at native (scaleFactor) resolution. */
function cropToDataUrl(frame: Frame, sel: Rect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const f = frame.scaleFactor
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sel.w * f)
      canvas.height = Math.round(sel.h * f)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('2D canvas context unavailable'))
        return
      }
      ctx.drawImage(img, sel.x * f, sel.y * f, sel.w * f, sel.h * f, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load frozen frame'))
    img.src = frame.dataUrl
  })
}
