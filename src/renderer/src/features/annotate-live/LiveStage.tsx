import type { ReactElement, RefObject } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Group } from 'react-konva'
import { renderShape, type ShapeHandlers } from '../annotate/shapes'
import { opacityAt } from './fade'
import type { LiveAnnotations } from './useLiveAnnotations'

/** Live shapes are never selectable or draggable — see useLiveAnnotations. */
const INERT: ShapeHandlers = {
  draggable: false,
  onSelect: () => {},
  onDragStart: () => {},
  onDragEnd: () => {},
  // Unreachable: LiveShape excludes TextShape, so there is no label to re-open.
  onEditText: () => {}
}

type Props = {
  anno: LiveAnnotations
  width: number
  height: number
  layerRef: RefObject<Konva.Layer | null>
}

/**
 * The drawing surface used while recording — a pure renderer; useLiveAnnotations
 * owns the pointer handling on `window`.
 *
 * One layer, shapes only. That layer's canvas is what the recorders blit into each
 * encoded frame, so nothing that isn't meant to appear in the file may be drawn
 * here — the tool strip and Stop pill are plain DOM, deliberately outside the stage.
 */
export function LiveStage({ anno, width, height, layerRef }: Props): ReactElement {
  const all = anno.draft ? [...anno.shapes, anno.draft] : anno.shapes
  return (
    <Stage width={width} height={height} style={{ position: 'fixed', inset: 0, cursor: 'crosshair' }}>
      <Layer ref={layerRef} listening={false}>
        {all.map((s) => (
          <Group key={s.id} opacity={opacityAt(s.bornAt, anno.now)}>
            {renderShape(s, null, undefined, INERT)}
          </Group>
        ))}
      </Layer>
    </Stage>
  )
}
