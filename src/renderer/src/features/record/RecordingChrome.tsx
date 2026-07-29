import type { ReactElement } from 'react'
import type { WorkArea } from '@preload/index'
import { useElementRect } from '../annotate/useElementRect'
import { useToolbarPlacement } from '../annotate/useToolbarPlacement'
import { LiveStage } from '../annotate-live/LiveStage'
import { LiveToolbar } from '../annotate-live/LiveToolbar'
import type { LiveSurface } from '../annotate-live/useLiveSurface'
import { RecordingPill } from './RecordingPill'
import { recordingBorder } from './styles'
import type { Rect, RecordingChromeSource } from './types'

type Props = {
  recorder: RecordingChromeSource
  surface: LiveSurface
  /** The region outline to keep on screen, or null in full-screen mode. */
  regionBox: Rect | null
  workArea: WorkArea
}

/**
 * Everything drawn on screen *while* a capture is running: the region outline, the
 * annotation surface, and the draggable Stop pill.
 *
 * Shared by the video and GIF overlays — they rendered this identically, and it has to
 * stay identical, since the two differ only in how frames are encoded.
 *
 * Note what is deliberately NOT here: the pill and toolbar are plain DOM, outside the
 * Konva stage, so content protection keeps them out of the recording while the stage's
 * shapes get composited in.
 */
export function RecordingChrome({ recorder, surface, regionBox, workArea }: Props): ReactElement {
  // The pill is draggable, so its position is measured rather than derived; the toolbar
  // then follows it, flipping above rather than hiding behind the Dock.
  const pillRect = useElementRect(recorder.pillRef, true)
  const toolbar = useToolbarPlacement(surface.drawMode ? pillRect : null, workArea, { align: 'center' })

  return (
    <>
      {surface.drawMode && (
        <LiveStage
          anno={surface.anno}
          width={window.innerWidth}
          height={window.innerHeight}
          layerRef={surface.layerRef}
        />
      )}

      {regionBox && (
        <div
          style={{
            ...recordingBorder,
            left: regionBox.x,
            top: regionBox.y,
            width: regionBox.w,
            height: regionBox.h
          }}
        />
      )}

      {surface.drawMode && <LiveToolbar anno={surface.anno} barRef={toolbar.barRef} style={toolbar.style} />}

      <RecordingPill
        elapsed={recorder.elapsed}
        saving={recorder.saving}
        pillPos={recorder.pillPos}
        pillRef={recorder.pillRef}
        workArea={workArea}
        onGripMouseDown={recorder.onPillMouseDown}
        onStop={recorder.stop}
        drawMode={surface.drawMode}
        onToggleDraw={surface.onToggleDraw}
      />
    </>
  )
}
