import type { ReactElement } from 'react'
import { Stage, Layer, Image as KonvaImage, Group, Transformer } from 'react-konva'
import type { Frame } from '@preload/index'
import { useAnnotationEditor } from './useAnnotationEditor'
import { renderShape } from './shapes'
import { Toolbar } from './Toolbar'
import {
  cornerHandle,
  fullDim,
  hintStyle,
  overlayRoot,
  selectionDim,
  sizePreviewCircle,
  sizePreviewLabel,
  sizePreviewWrap,
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
      <Stage
        ref={editor.stageRef}
        width={frame.width}
        height={frame.height}
        onMouseDown={editor.onStageMouseDown}
        onMouseMove={editor.onStageMouseMove}
        onMouseUp={editor.onStageMouseUp}
      >
        <Layer>
          <KonvaImage image={editor.bg ?? undefined} width={frame.width} height={frame.height} name="bg" />
        </Layer>

        {box && (
          <Layer>
            <Group x={box.x} y={box.y} clipX={0} clipY={0} clipWidth={box.w} clipHeight={box.h}>
              {editor.all.map((shape) =>
                renderShape(shape, editor.selectedId, editing?.id, editor.shapeHandlers)
              )}
            </Group>
            <Transformer
              ref={editor.trRef}
              rotateEnabled={false}
              keepRatio={false}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              onTransformStart={editor.onTransformStart}
              onTransformEnd={editor.onTransformEnd}
            />
          </Layer>
        )}
      </Stage>

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

      {sizePreview && (
        <div style={sizePreviewWrap(sizePreview.x, sizePreview.y)}>
          <div style={sizePreviewCircle(sizePreview.size)} />
          <div style={sizePreviewLabel}>{sizePreview.size}px</div>
        </div>
      )}

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
