import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Group, Transformer } from 'react-konva'
import type { Frame } from '../../preload/index'
import { loadImage, type Box } from './lib/image'
import { Toolbar } from './annotation/Toolbar'
import { isMeaningful, normalizeRect, renderShape, type ShapeHandlers } from './annotation/shapes'
import {
  COLORS,
  DEFAULT_STROKE,
  MAX_STROKE,
  MIN_STROKE,
  fontSizeFor,
  type Shape,
  type Tool
} from './annotation/types'

const MIN_BOX = 6
const TOOLBAR_HEIGHT = 44
const GAP = 8
const DIM = 'rgba(165, 165, 170, 0.42)'
const SIZE_PREVIEW_MS = 700

type Pt = { x: number; y: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Editing = { id: string; x: number; y: number; value: string; fontSize: number; fill: string }
type SizePreview = { x: number; y: number; size: number }
type Drag =
  | { kind: 'create'; start: Pt; prevBox: Box | null }
  | { kind: 'moveBox'; last: Pt }
  | { kind: 'draw' }

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))
const inBox = (p: Pt, b: Box): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

/**
 * Screenshot capture + annotation editor.
 *
 * Full-screen Konva stage shows the frozen frame; a DOM overlay greys everything
 * except the selection box (a window into the frozen screen). Default Move tool
 * moves the box, selects/drags shapes (native Konva drag), and resizes rects via a
 * Transformer (corner handles). Draw tools draw inside the box; Cmd+Scroll adjusts
 * thickness with a size preview. Full undo/redo. Copy exports the box at native res.
 */
export function ScreenshotOverlay({ frame }: { frame: Frame }): ReactElement {
  const [box, setBox] = useState<Box | null>(null)
  const [tool, setTool] = useState<Tool>('move')
  const [color, setColor] = useState<string>(COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [bg, setBg] = useState<HTMLImageElement | null>(null)
  const [undoStack, setUndoStack] = useState<Shape[][]>([])
  const [redoStack, setRedoStack] = useState<Shape[][]>([])
  const [sizePreview, setSizePreview] = useState<SizePreview | null>(null)
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
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

  useEffect(() => () => window.clearTimeout(previewTimer.current), [])

  // Attach the Transformer to the selected rect (corner-resize); detach otherwise.
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const sel = shapes.find((s) => s.id === selectedId)
    const node = selectedId && sel?.type === 'rect' ? stage.findOne<Konva.Node>(`#${selectedId}`) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, shapes, box])

  // History.
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
              return {
                ...sh,
                fontSize: clamp(sh.fontSize + delta * 4, fontSizeFor(MIN_STROKE), fontSizeFor(MAX_STROKE))
              }
            }
            return { ...sh, strokeWidth: clamp(sh.strokeWidth + delta, MIN_STROKE, MAX_STROKE) }
          })
        )
      }
      setSizePreview({ x: e.clientX, y: e.clientY, size: next })
      window.clearTimeout(previewTimer.current)
      previewTimer.current = window.setTimeout(() => setSizePreview(null), SIZE_PREVIEW_MS)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [strokeWidth, selectedId])

  const pointer = (): Pt => stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 }

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (editing) return
    // Let the Transformer handle its own anchor drags.
    if (e.target.getParent()?.className === 'Transformer') return
    const p = pointer()

    if (!box || !inBox(p, box)) {
      drag.current = { kind: 'create', start: p, prevBox: box }
      setBox({ x: p.x, y: p.y, w: 0, h: 0 })
      setSelectedId(null)
      setDragging(true)
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

    // Move tool: shape clicks are handled by the shape (cancelBubble) → reaching here
    // means empty space, so move the box.
    if (tool === 'move') {
      setSelectedId(null)
      drag.current = { kind: 'moveBox', last: p }
      setDragging(true)
      return
    }

    // Draw tool.
    const id = crypto.randomUUID()
    drag.current = { kind: 'draw' }
    setDragging(true)
    if (tool === 'rect') {
      setDraft({ id, type: 'rect', x: local.x, y: local.y, width: 0, height: 0, stroke: color, strokeWidth })
    } else if (tool === 'pen') {
      setDraft({ id, type: 'pen', points: [local.x, local.y], stroke: color, strokeWidth })
    } else {
      setDraft({
        id,
        type: tool as 'line' | 'arrow',
        points: [local.x, local.y, local.x, local.y],
        stroke: color,
        strokeWidth
      })
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
    setDragging(false)
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
    if (d.kind === 'draw') {
      if (draft && isMeaningful(draft)) {
        snapshot(shapes)
        setShapes((s) => [...s, normalizeRect(draft)])
      }
      setDraft(null)
    }
  }

  const shapeHandlers: ShapeHandlers = {
    draggable: tool === 'move',
    onSelect: (id, e) => {
      if (tool === 'move') {
        e.cancelBubble = true
        setSelectedId(id)
      }
    },
    onDragStart: () => snapshot(shapes),
    onDragEnd: (id, e) => {
      const node = e.target
      setShapes((s) =>
        s.map((sh) => {
          if (sh.id !== id) return sh
          if (sh.type === 'rect' || sh.type === 'text') return { ...sh, x: node.x(), y: node.y() }
          const dx = node.x()
          const dy = node.y()
          node.position({ x: 0, y: 0 })
          return { ...sh, points: sh.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
        })
      )
    }
  }

  const onRectTransformEnd = (): void => {
    const node = trRef.current?.nodes()[0]
    if (!node) return
    const sx = node.scaleX()
    const sy = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    const id = node.id()
    setShapes((s) =>
      s.map((sh) =>
        sh.id === id && sh.type === 'rect'
          ? {
              ...sh,
              x: node.x(),
              y: node.y(),
              width: Math.max(5, node.width() * sx),
              height: Math.max(5, node.height() * sy)
            }
          : sh
      )
    )
  }

  const commitEditing = (): void => {
    if (!editing) return
    if (editing.value.trim() === '') {
      setShapes((s) => s.filter((sh) => sh.id !== editing.id))
      setUndoStack((u) => u.slice(0, -1))
    }
    setEditing(null)
  }

  const onCopy = (): void => {
    commitEditing()
    setSelectedId(null)
    trRef.current?.nodes([])
    requestAnimationFrame(() => {
      const stage = stageRef.current
      if (!stage || !box) return
      const url = stage.toDataURL({
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        pixelRatio: frame.scaleFactor
      })
      window.snapit.copyImage(url)
    })
  }

  // Resize the capture box by dragging a corner handle (DOM, window-tracked).
  const startBoxResize = (corner: Corner, e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!box) return
    const start = { x: e.clientX, y: e.clientY }
    const startBox = box
    setSelectedId(null)
    setDragging(true)
    const onMove = (ev: MouseEvent): void => {
      setBox(resizeBox(startBox, corner, ev.clientX - start.x, ev.clientY - start.y, frame))
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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

        {box && (
          <Layer>
            <Group x={box.x} y={box.y} clipX={0} clipY={0} clipWidth={box.w} clipHeight={box.h}>
              {all.map((shape) => renderShape(shape, selectedId, editing?.id, shapeHandlers))}
            </Group>
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              keepRatio={false}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              onTransformStart={() => snapshot(shapes)}
              onTransformEnd={onRectTransformEnd}
            />
          </Layer>
        )}
      </Stage>

      {/* Grey overtone: everything dimmed except the bright selection window. */}
      {box ? (
        <div
          style={{
            position: 'fixed',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 9999px ${DIM}`,
            outline: '3px dashed #ffffff',
            pointerEvents: 'none'
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: DIM, pointerEvents: 'none' }} />
      )}

      {/* Corner handles to resize the capture box — hidden while dragging. */}
      {box &&
        !dragging &&
        (['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
          const left = corner === 'nw' || corner === 'sw' ? box.x : box.x + box.w
          const top = corner === 'nw' || corner === 'ne' ? box.y : box.y + box.h
          const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
          return (
            <div
              key={corner}
              onMouseDown={(e) => startBoxResize(corner, e)}
              style={{
                position: 'fixed',
                left,
                top,
                width: 12,
                height: 12,
                transform: 'translate(-50%, -50%)',
                background: '#fff',
                border: '1.5px solid #4aa3ff',
                borderRadius: 2,
                cursor,
                pointerEvents: 'auto'
              }}
            />
          )
        })}

      {editing && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => {
            const v = e.target.value
            setEditing({ ...editing, value: v })
            setShapes((s) =>
              s.map((sh) => (sh.id === editing.id && sh.type === 'text' ? { ...sh, text: v } : sh))
            )
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
        <div
          style={{
            position: 'fixed',
            left: sizePreview.x,
            top: sizePreview.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }}
        >
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

/** Resize a box by dragging one corner, clamped to a min size and the screen. */
function resizeBox(b: Box, corner: Corner, dx: number, dy: number, frame: Frame): Box {
  const right = b.x + b.w
  const bottom = b.y + b.h
  let { x, y, w, h } = b
  if (corner === 'nw' || corner === 'sw') {
    const left = clamp(b.x + dx, 0, right - MIN_BOX)
    x = left
    w = right - left
  } else {
    w = clamp(right + dx, b.x + MIN_BOX, frame.width) - b.x
  }
  if (corner === 'nw' || corner === 'ne') {
    const topEdge = clamp(b.y + dy, 0, bottom - MIN_BOX)
    y = topEdge
    h = bottom - topEdge
  } else {
    h = clamp(bottom + dy, b.y + MIN_BOX, frame.height) - b.y
  }
  return { x, y, w, h }
}

function toolbarPosition(sel: Box): CSSProperties {
  const below = sel.y + sel.h + GAP
  const top =
    below + TOOLBAR_HEIGHT <= window.innerHeight ? below : Math.max(GAP, sel.y - TOOLBAR_HEIGHT - GAP)
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
