import type { ReactElement } from 'react'
import { Stage, Layer, Image as KonvaImage, Group, Transformer } from 'react-konva'
import { renderShape } from './shapes'
import type { AnnotationEditor } from './useAnnotationEditor'

type Props = {
  editor: AnnotationEditor
  width: number
  height: number
}

/**
 * The Konva stage shared by every annotation surface: the background image on one
 * layer, and the clipped shapes + resize transformer on another. Surface-specific
 * chrome (dimming, corner handles, fit-scaling) is layered around it by the caller.
 */
export function AnnotationStage({ editor, width, height }: Props): ReactElement {
  const { box } = editor
  return (
    <Stage
      ref={editor.stageRef}
      width={width}
      height={height}
      onMouseDown={editor.onStageMouseDown}
      onMouseMove={editor.onStageMouseMove}
      onMouseUp={editor.onStageMouseUp}
    >
      <Layer>
        <KonvaImage image={editor.bg ?? undefined} width={width} height={height} name="bg" />
      </Layer>

      {box && (
        <Layer>
          <Group x={box.x} y={box.y} clipX={0} clipY={0} clipWidth={box.w} clipHeight={box.h}>
            {editor.all.map((shape) =>
              renderShape(shape, editor.selectedId, editor.editing?.id, editor.shapeHandlers)
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
  )
}
