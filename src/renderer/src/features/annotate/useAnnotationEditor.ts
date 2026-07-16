import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react'
import Konva from 'konva'
import type { Frame } from '@preload/index'
import { loadImage, type Box } from '@renderer/lib/image'
import { isMeaningful, normalizeRect, type ShapeHandlers } from './shapes'
import {
  COLORS,
  DEFAULT_STROKE,
  MAX_STROKE,
  MIN_STROKE,
  fontSizeFor,
  type Corner,
  type Drag,
  type Editing,
  type Pt,
  type Shape,
  type SizePreview,
  type Tool
} from './types'
import { MIN_BOX, clamp, clampBox, inBox, resizeBox } from './geometry'

const SIZE_PREVIEW_MS = 700

export type AnnotationEditor = {
  box: Box | null
  bg: HTMLImageElement | null
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  selectedId: string | null
  editing: Editing | null
  sizePreview: SizePreview | null
  dragging: boolean
  shapes: Shape[]
  all: Shape[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  stageRef: RefObject<Konva.Stage | null>
  trRef: RefObject<Konva.Transformer | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onStageMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onStageMouseMove: () => void
  onStageMouseUp: () => void
  shapeHandlers: ShapeHandlers
  onTransformStart: () => void
  onTransformEnd: () => void
  onEditingChange: (value: string) => void
  onEditingKeyDown: (e: ReactKeyboardEvent) => void
  commitEditing: () => void
  startBoxResize: (corner: Corner, e: ReactMouseEvent) => void
  exportImage: (use: (dataUrl: string) => void, mimeOverride?: string) => void
  onCopy: () => void
  onSave: () => void
  onSaveAs: () => void
}

/**
 * Options that let the same engine drive both surfaces:
 *  - screenshot: drag to select a region on a frozen full-screen frame.
 *  - image edit: the whole opened image is the canvas (no region select).
 */
export type EditorOptions = {
  /** Pre-set the capture box (image edit sets this to the whole image). */
  initialBox?: Box | null
  /** Allow creating / moving / resizing the box by dragging (screenshot only). */
  regionSelect?: boolean
  /** Export MIME type (image edit preserves the original format). Defaults to PNG. */
  mimeType?: string
}

/**
 * Annotation editor engine: owns the selection box, shapes, draft, selection,
 * text editing, undo/redo, and all pointer/keyboard/wheel interaction for the
 * screenshot overlay. The component stays purely presentational.
 */
export function useAnnotationEditor(frame: Frame, opts: EditorOptions = {}): AnnotationEditor {
  const { initialBox = null, regionSelect = true, mimeType } = opts
  const [box, setBox] = useState<Box | null>(initialBox)
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Focus the text box reliably once it mounts (autoFocus can miss after the
  // canvas mousedown / on a freshly activated window).
  useEffect(() => {
    if (!editing) return
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [editing?.id])

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

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (editing) return
    // Let the Transformer handle its own anchor drags.
    if (e.target.getParent()?.className === 'Transformer') return
    const p = pointer()

    if (!box || !inBox(p, box)) {
      // Image edit: the box is fixed to the whole image — a click outside it (or
      // before one exists) just clears the selection rather than starting a new box.
      if (!regionSelect) {
        setSelectedId(null)
        return
      }
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
    // means empty space. On the screenshot overlay that drags the box; in image edit
    // the box is the whole image, so it just clears the selection.
    if (tool === 'move') {
      setSelectedId(null)
      if (regionSelect) {
        drag.current = { kind: 'moveBox', last: p }
        setDragging(true)
      }
      return
    }

    // Draw tool.
    const id = crypto.randomUUID()
    drag.current = { kind: 'draw' }
    setDragging(true)
    if (tool === 'rect') {
      setDraft({ id, type: 'rect', x: local.x, y: local.y, width: 0, height: 0, stroke: color, strokeWidth })
    } else if (tool === 'circle') {
      setDraft({
        id,
        type: 'circle',
        x: local.x,
        y: local.y,
        width: 0,
        height: 0,
        stroke: color,
        strokeWidth
      })
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

  const onStageMouseMove = (): void => {
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
      if (prev.type === 'rect' || prev.type === 'circle')
        return { ...prev, width: local.x - prev.x, height: local.y - prev.y }
      if (prev.type === 'pen') return { ...prev, points: [...prev.points, local.x, local.y] }
      if (prev.type === 'text') return prev
      return { ...prev, points: [prev.points[0], prev.points[1], local.x, local.y] }
    })
  }

  const onStageMouseUp = (): void => {
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
          if (sh.type === 'circle') return { ...sh, x: node.x() - sh.width / 2, y: node.y() - sh.height / 2 }
          const dx = node.x()
          const dy = node.y()
          node.position({ x: 0, y: 0 })
          return { ...sh, points: sh.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
        })
      )
    }
  }

  const onTransformStart = (): void => snapshot(shapes)

  const onTransformEnd = (): void => {
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

  const onEditingChange = (value: string): void => {
    if (!editing) return
    setEditing({ ...editing, value })
    setShapes((s) =>
      s.map((sh) => (sh.id === editing.id && sh.type === 'text' ? { ...sh, text: value } : sh))
    )
  }

  const onEditingKeyDown = (e: ReactKeyboardEvent): void => {
    e.stopPropagation()
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      e.preventDefault()
      commitEditing()
    }
  }

  // Flatten the box region to a native-res image (UI chrome excluded) and hand it
  // off. Defaults to the configured mimeType (PNG for screenshot; the original
  // format for image edit); callers can override it — copy always exports PNG.
  const exportImage = (use: (dataUrl: string) => void, mimeOverride?: string): void => {
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
        pixelRatio: frame.scaleFactor,
        mimeType: mimeOverride ?? mimeType
      })
      use(url)
    })
  }
  // Clipboard images are always PNG — nativeImage can't reliably decode webp data URLs.
  const onCopy = (): void => exportImage((url) => window.snapit.copyImage(url), 'image/png')
  const onSave = (): void => exportImage((url) => void window.snapit.saveImage(url))
  const onSaveAs = (): void => exportImage((url) => void window.snapit.saveImageAs(url))

  // Cmd/Ctrl+C copies the cropped region too — a keyboard alternative to the Copy
  // button. Skipped while editing text so the textarea's own copy still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (editing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return
      e.preventDefault()
      onCopy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, box])

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

  return {
    box,
    bg,
    tool,
    setTool,
    color,
    setColor,
    selectedId,
    editing,
    sizePreview,
    dragging,
    shapes,
    all,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    stageRef,
    trRef,
    textareaRef,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp,
    shapeHandlers,
    onTransformStart,
    onTransformEnd,
    onEditingChange,
    onEditingKeyDown,
    commitEditing,
    startBoxResize,
    exportImage,
    onCopy,
    onSave,
    onSaveAs
  }
}
