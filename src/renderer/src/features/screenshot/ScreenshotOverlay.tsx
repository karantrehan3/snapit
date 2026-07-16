import type { ReactElement } from 'react'
import type { Frame } from '@preload/index'
import { useAnnotationEditor } from '@renderer/features/annotate/useAnnotationEditor'
import { AnnotationStage } from '@renderer/features/annotate/AnnotationStage'
import { SizePreview } from '@renderer/features/annotate/SizePreview'
import { Toolbar } from '@renderer/features/annotate/Toolbar'
import {
  cornerHandle,
  fullDim,
  hintStyle,
  overlayRoot,
  selectionDim,
  textareaStyle,
  toolbarPosition
} from './styles'

/**
 * Screenshot capture + annotation editor.
 *
 * Full-screen Konva stage shows the frozen frame; a DOM overlay greys everything
 * except the selection box. All interaction lives in useAnnotationEditor — this
 * component just renders the stage, overlays, text box, and toolbar.
 */
export function ScreenshotOverlay({ frame }: { frame: Frame }): ReactElement {
  const editor = useAnnotationEditor(frame)
  const { box, editing, sizePreview } = editor

  return (
    <div style={overlayRoot}>
      <AnnotationStage editor={editor} width={frame.width} height={frame.height} />

      {/* Grey overtone: everything dimmed except the bright selection window. */}
      {box ? <div style={selectionDim(box)} /> : <div style={fullDim} />}

      {/* Corner handles to resize the capture box — hidden while dragging. */}
      {box &&
        !editor.dragging &&
        (['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
          const left = corner === 'nw' || corner === 'sw' ? box.x : box.x + box.w
          const top = corner === 'nw' || corner === 'ne' ? box.y : box.y + box.h
          const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
          return (
            <div
              key={corner}
              onMouseDown={(e) => editor.startBoxResize(corner, e)}
              style={cornerHandle(left, top, cursor)}
            />
          )
        })}

      {editing && (
        <textarea
          ref={editor.textareaRef}
          autoFocus
          spellCheck={false}
          value={editing.value}
          onChange={(e) => editor.onEditingChange(e.target.value)}
          onKeyDown={editor.onEditingKeyDown}
          onBlur={editor.commitEditing}
          style={textareaStyle(box, editing)}
        />
      )}

      {!box && <div style={hintStyle}>Drag to select · Esc to cancel</div>}

      <SizePreview preview={sizePreview} />

      {box && (
        <Toolbar
          tool={editor.tool}
          setTool={editor.setTool}
          color={editor.color}
          setColor={editor.setColor}
          canUndo={editor.canUndo}
          onUndo={editor.undo}
          canRedo={editor.canRedo}
          onRedo={editor.redo}
          onCopy={editor.onCopy}
          onSave={editor.onSave}
          onSaveAs={editor.onSaveAs}
          onCancel={() => window.snapit.closeOverlay()}
          style={toolbarPosition(box)}
        />
      )}
    </div>
  )
}
