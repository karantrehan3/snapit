import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Group, Rect } from 'react-konva'
import type { Frame } from '../../preload/index'
import { loadImage, type Box } from './lib/image'
import { Toolbar } from './annotation/Toolbar'
import { isMeaningful, moveShape, normalizeRect, renderShape } from './annotation/shapes'
import { COLORS, MAX_STROKE, MIN_STROKE, SIZES, fontSizeFor, type Shape, type Tool } from './annotation/types'

const MIN_BOX = 6
const TOOLBAR_HEIGHT = 44
const GAP = 8
const DIM = 'rgba(0, 0, 0, 0.5)'
const SIZE_PREVIEW_MS = 700

type Pt = { x: number; y: number }
type Editing = { id: string; x: number; y: number; value: string; fontSize: number; fill: string }
type SizePreview = { x: number; y: number; size: number }
type Drag =
  | { kind: 'create'; start: Pt; prevBox: Box | null }
  | { kind: 'moveBox'; last: Pt }
  | { kind: 'moveShape'; id: string; last: Pt; origin: Shape[]; moved: boolean }
  | { kind: 'draw' }

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))
const inBox = (p: Pt, b: Box): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

/**
 * Screenshot capture + annotation editor.
 *
 * Full-screen Konva stage over the frozen frame. The selection box is a window
 * into the frozen screen — moving it reveals a different area and drawn shapes
 * follow it. Default Move tool moves the box / selects shapes; draw tools draw
 * inside the box; Cmd+Scroll adjusts thickness (with a size preview). Full
 * undo/redo history. Copy exports the box region at native resolution.
 */
export function ScreenshotOverlay({ frame }: { frame: Frame }): ReactElement {
  const [box, setBox] = useState<Box | null>(null)
  const [tool, setTool] = useState<Tool>('move')
  const [color, setColor] = useState<string>(COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState<number>(SIZES[1])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [bg, setBg] = useState<HTMLImageElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const [undoStack, setUndoStack] = useState<Shape[][]>([])
  const [redoStack, setRedoStack] = useState<Shape[][]>([])
  const [sizePreview, setSizePreview] = useState<SizePreview | null>(null)

  const stageRef = useRef<Konva.Stage>(null)
  const drag = useRef<Drag | null>(null)
  const previewTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void loadImage(frame.dataUrl).then((img) => {
      if (alive) setBg(img)
    })
    return () => {
      alive = false
    }
  }, [frame])

  useEffect(() => {
    const c = stageRef.current?.container()
    if (c) c.style.cursor = tool === 'text' ? 'text' : tool === 'move' ? 'default' : 'crosshair'
  }, [tool])

  // History helpers.
  const snapshot = (prev: Shape[]): void => {
    setUndoStack((u) => [...u, prev])
    setRedoStack([])
  }
  const undo = (): void => {
    if (undoStack.length === 0) return
    setRedoStack([...redoStack, shapes])
    setShapes(undoStack[undoStack.length - 1])
    setUndoStack(undoStack.slice(0, -1))
    setDraft(null)
    setSelectedId(null)
  }
  const redo = (): void => {
    if (redoStack.length === 0) return
    setUndoStack([...undoStack, shapes])
    setShapes(redoStack[redoStack.length - 1])
    setRedoStack(redoStack.slice(0, -1))
    setDraft(null)
    setSelectedId(null)
  }

  // Delete selected; undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editing) {
        e.preventDefault()
        snapshot(shapes)
        setShapes((s) => s.filter((sh) => sh.id !== selectedId))
        setSelectedId(null)
        return
      }
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase()
        if (k === 'z') {
          e.preventDefault()
          e.shiftKey ? redo() : undo()
        } else if (k === 'y') {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shapes, undoStack, redoStack, selectedId, editing])

  // Cmd/Ctrl+Scroll adjusts thickness (and the selected shape) + shows a size preview.
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      const next = clamp(strokeWidth + delta, MIN_STROKE, MAX_STROKE)
      setStrokeWidth(next)
      if (selectedId) {
        setShapes((s) =>
          s.map((sh) => {
            if (sh.id !== selectedId) return sh
            if (sh.type === 'text') {
              return { ...sh, fontSize: clamp(sh.fontSize + delta * 4, fontSizeFor(MIN_STROKE), fontSizeFor(MAX_STROKE)) }
            }
            return { ...sh, strokeWidth: clamp(sh.strokeWidth + delta, MIN_STROKE, MAX_STROKE) }
          })
        )
      }
      setSizePreview({ x: e.clientX, y: e.clientY, size: next })
      if (previewTimer.current) window.clearTimeout(previewTimer.current)
      previewTimer.current = window.setTimeout(() => setSizePreview(null), SIZE_PREVIEW_MS)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [strokeWidth, selectedId])

  const pointer = (): Pt => stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 }

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (editing) return
    const p = pointer()

    if (!box || !inBox(p, box)) {
      drag.current = { kind: 'create', start: p, prevBox: box }
      setBox({ x: p.x, y: p.y, w: 0, h: 0 })
      setSelectedId(null)
      return
    }

    const local: Pt = { x: p.x - box.x, y: p.y - box.y }

    if (tool === 'text') {
      const id = crypto.randomUUID()
      const fontSize = fontSizeFor(strokeWidth)
      snapshot(shapes)
      setShapes((s) => [...s, { id, type: 'text', x: local.x, y: local.y, text: '', fill: color, fontSize }])
      setEditing({ id, x: local.x, y: local.y, value: '', fontSize, fill: color })
      return
    }

    if (tool === 'move') {
      const id = e.target.name() === 'shape' ? e.target.id() : null
      if (id) {
        setSelectedId(id)
        drag.current = { kind: 'moveShape', id, last: p, origin: shapes, moved: false }
      } else {
        setSelectedId(null)
        drag.current = { kind: 'moveBox', last: p }
      }
      return
    }

    // Draw tool.
    const id = crypto.randomUUID()
    drag.current = { kind: 'draw' }
    if (tool === 'rect') {
      setDraft({ id, type: 'rect', x: local.x, y: local.y, width: 0, height: 0, stroke: color, strokeWidth })
    } else if (tool === 'pen') {
      setDraft({ id, type: 'pen', points: [local.x, local.y], stroke: color, strokeWidth })
    } else {
      setDraft({ id, type: tool as 'line' | 'arrow', points: [local.x, local.y, local.x, local.y], stroke: color, strokeWidth })
    }
  }

  const onMouseMove = (): void => {
    const d = drag.current
    if (!d) return
    const p = pointer()

    if (d.kind === 'create') {
      const s = d.start
      setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
      return
    }
    if (d.kind === 'moveBox') {
      const dx = p.x - d.last.x
      const dy = p.y - d.last.y
      d.last = p
      setBox((b) => (b ? clampBox({ ...b, x: b.x + dx, y: b.y + dy }, frame) : b))
      return
    }
    if (d.kind === 'moveShape') {
      const dx = p.x - d.last.x
      const dy = p.y - d.last.y
      d.last = p
      d.moved = true
      setShapes((s) => s.map((sh) => (sh.id === d.id ? moveShape(sh, dx, dy) : sh)))
      return
    }
    if (!box) return
    const local: Pt = { x: p.x - box.x, y: p.y - box.y }
    setDraft((prev) => {
      if (!prev) return prev
      if (prev.type === 'rect') return { ...prev, width: local.x - prev.x, height: local.y - prev.y }
      if (prev.type === 'pen') return { ...prev, points: [...prev.points, local.x, local.y] }
      if (prev.type === 'text') return prev
      return { ...prev, points: [prev.points[0], prev.points[1], local.x, local.y] }
    })
  }

  const onMouseUp = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return

    if (d.kind === 'create') {
      setBox((b) => {
        if (b && b.w >= MIN_BOX && b.h >= MIN_BOX) {
          if (d.prevBox) {
            setShapes([])
            setUndoStack([])
            setRedoStack([])
            setSelectedId(null)
          }
          return b
        }
        return d.prevBox
      })
      return
    }
    if (d.kind === 'moveShape') {
      if (d.moved) snapshot(d.origin)
      return
    }
    if (d.kind === 'draw') {
      if (draft && isMeaningful(draft)) {
        snapshot(shapes)
        setShapes((s) => [...s, normalizeRect(draft)])
      }
      setDraft(null)
    }
  }

  const commitEditing = (): void => {
    if (!editing) return
    if (editing.value.trim() === '') {
      // Empty text: drop it and the undo step we created when it was added.
      setShapes((s) => s.filter((sh) => sh.id !== editing.id))
      setUndoStack((u) => u.slice(0, -1))
    }
    setEditing(null)
  }

  const onCopy = (): void => {
    commitEditing()
    setSelectedId(null)
    setExporting(true)
    requestAnimationFrame(() => {
      const stage = stageRef.current
      if (!stage || !box) {
        setExporting(false)
        return
      }
      const url = stage.toDataURL({ x: box.x, y: box.y, width: box.w, height: box.h, pixelRatio: frame.scaleFactor })
      window.snapit.copyImage(url)
    })
  }

  const all = box ? (draft ? [...shapes, draft] : shapes) : []

  return (
    <div style={{ position: 'fixed', inset: 0, userSelect: 'none' }}>
      <Stage
        ref={stageRef}
        width={frame.width}
        height={frame.height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        <Layer>
          <KonvaImage image={bg ?? undefined} width={frame.width} height={frame.height} name="bg" />
        </Layer>

        <Layer listening={false}>{dimRects(box, frame)}</Layer>

        {box && (
          <Layer>
            <Group x={box.x} y={box.y} clipX={0} clipY={0} clipWidth={box.w} clipHeight={box.h}>
              {all.map((shape) => renderShape(shape, selectedId, editing?.id))}
            </Group>
          </Layer>
        )}

        {box && !exporting && (
          <Layer listening={false}>
            <Rect x={box.x} y={box.y} width={box.w} height={box.h} stroke="#ffffff" strokeWidth={2} dash={[7, 5]} />
          </Layer>
        )}
      </Stage>

      {editing && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => {
            const v = e.target.value
            setEditing({ ...editing, value: v })
            setShapes((s) => s.map((sh) => (sh.id === editing.id && sh.type === 'text' ? { ...sh, text: v } : sh)))
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
              e.preventDefault()
              commitEditing()
            }
          }}
          onBlur={commitEditing}
          style={textareaStyle(box, editing)}
        />
      )}

      {!box && <div style={hintStyle}>Drag to select · Esc to cancel</div>}

      {sizePreview && (
        <div style={{ position: 'fixed', left: sizePreview.x, top: sizePreview.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
          <div
            style={{
              width: sizePreview.size,
              height: sizePreview.size,
              borderRadius: '50%',
              border: '2px solid #fff',
              background: 'rgba(255, 255, 255, 0.15)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: 8,
              padding: '1px 6px',
              borderRadius: 3,
              background: 'rgba(0, 0, 0, 0.7)',
              color: '#fff',
              font: '11px -apple-system, system-ui, sans-serif',
              whiteSpace: 'nowrap'
            }}
          >
            {sizePreview.size}px
          </div>
        </div>
      )}

      {box && (
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          canUndo={undoStack.length > 0}
          onUndo={undo}
          canRedo={redoStack.length > 0}
          onRedo={redo}
          onCopy={onCopy}
          onCancel={() => window.snapit.closeOverlay()}
          style={toolbarPosition(box)}
        />
      )}
    </div>
  )
}

function clampBox(b: Box, frame: Frame): Box {
  return {
    ...b,
    x: clamp(b.x, 0, Math.max(0, frame.width - b.w)),
    y: clamp(b.y, 0, Math.max(0, frame.height - b.h))
  }
}

function dimRects(box: Box | null, frame: Frame): ReactElement {
  const { width: W, height: H } = frame
  if (!box) return <Rect x={0} y={0} width={W} height={H} fill={DIM} />
  const right = box.x + box.w
  const bottom = box.y + box.h
  return (
    <>
      <Rect x={0} y={0} width={W} height={box.y} fill={DIM} />
      <Rect x={0} y={bottom} width={W} height={H - bottom} fill={DIM} />
      <Rect x={0} y={box.y} width={box.x} height={box.h} fill={DIM} />
      <Rect x={right} y={box.y} width={W - right} height={box.h} fill={DIM} />
    </>
  )
}

function toolbarPosition(sel: Box): CSSProperties {
  const below = sel.y + sel.h + GAP
  const top = below + TOOLBAR_HEIGHT <= window.innerHeight ? below : Math.max(GAP, sel.y - TOOLBAR_HEIGHT - GAP)
  const left = Math.min(Math.max(GAP, sel.x), Math.max(GAP, window.innerWidth - 420))
  return { top, left }
}

function textareaStyle(box: Box | null, editing: Editing): CSSProperties {
  return {
    position: 'fixed',
    left: (box?.x ?? 0) + editing.x,
    top: (box?.y ?? 0) + editing.y,
    margin: 0,
    padding: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: editing.fill,
    fontSize: editing.fontSize,
    fontFamily: '-apple-system, system-ui, sans-serif',
    lineHeight: 1,
    resize: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre',
    minWidth: 40
  }
}

const hintStyle: CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  color: '#fff',
  font: '14px -apple-system, system-ui, sans-serif',
  opacity: 0.85,
  pointerEvents: 'none'
}
