import { useEffect, useState, type ReactElement } from 'react'
import type { DisplaySource, WorkArea } from '@preload/index'
import { useLiveSurface } from '../annotate-live/useLiveSurface'
import { useSourcePicker } from '../record/useSourcePicker'
import { useRegionSelect } from '../record/useRegionSelect'
import { SourceDropdown } from '../record/SourceDropdown'
import { FpsControl } from '../record/FpsControl'
import { ModeToggle } from '../record/ModeToggle'
import { RecordingChrome } from '../record/RecordingChrome'
import { useGifRecorder } from './useGifRecorder'
import {
  barDivider,
  centerHint,
  commandBar,
  DIM,
  errorText,
  ghostIcon,
  linkButton,
  primaryButton,
  regionBox,
  stage
} from '../record/styles'

const DEFAULT_FPS = 30

/**
 * GIF overlay — floating command bar (mirrors RecordOverlay, minus audio).
 *
 * The live screen stays visible; a frosted-glass bar docks top-centre with the
 * source picker (popover), full/region toggle and frame rate. A subtle nudge
 * offers switching to video (better for Slack/GitHub/Jira). While recording, the
 * region outline stays on screen (excluded from the capture by content
 * protection); the Stop pill is a draggable floater. GIF frames always route
 * through a canvas, so annotation needs no pre-arming here.
 */
export function GifOverlay({
  source,
  workArea,
  onReady
}: {
  source: DisplaySource
  workArea: WorkArea
  onReady?: () => void
}): ReactElement {
  const [fps, setFps] = useState(DEFAULT_FPS)

  // The live desktop shows through immediately; signal on mount so main reveals us.
  useEffect(() => {
    const raf = requestAnimationFrame(() => onReady?.())
    return () => cancelAnimationFrame(raf)
  }, [onReady])

  const picker = useSourcePicker(source.id)
  const { selectedId, canRegion } = picker
  const region = useRegionSelect(canRegion)

  // GIF frames always route through a canvas, so nothing extra is needed to make
  // annotation possible — but it still only maps correctly onto the display this
  // overlay covers, never onto a window or second-display capture.
  const surface = useLiveSurface(canRegion)
  const recorder = useGifRecorder(surface.options)

  if (recorder.phase === 'recording') {
    return (
      <RecordingChrome
        recorder={recorder}
        surface={surface}
        regionBox={region.regionMode ? region.box : null}
        workArea={workArea}
      />
    )
  }

  return (
    <div
      style={{
        ...stage,
        background: region.mode === 'region' ? 'transparent' : DIM,
        cursor: region.mode === 'region' ? 'crosshair' : 'default'
      }}
      onMouseDown={region.onStageMouseDown}
      onMouseMove={region.onStageMouseMove}
      onMouseUp={region.onStageMouseUp}
    >
      {region.mode === 'region' && region.box && (
        <div
          style={{
            ...regionBox,
            left: region.box.x,
            top: region.box.y,
            width: region.box.w,
            height: region.box.h
          }}
        />
      )}
      {region.mode === 'region' && !region.box && (
        <div style={{ ...centerHint, top: '46%' }}>Drag to select an area to record</div>
      )}
      {recorder.error && (
        <div style={{ ...centerHint, color: '#ff453a' }}>
          <span style={errorText}>{recorder.error}</span>
        </div>
      )}

      <div style={commandBar} onMouseDown={(e) => e.stopPropagation()}>
        <span style={{ fontSize: 15 }} aria-hidden>
          🎞️
        </span>

        <SourceDropdown
          sources={picker.sources}
          loading={picker.loading}
          tab={picker.tab}
          onTab={picker.setTab}
          selectedId={selectedId}
          onSelect={picker.setSelectedId}
        />

        {canRegion && <ModeToggle mode={region.mode} onChange={region.setMode} />}

        <div style={barDivider} />
        <FpsControl value={fps} onChange={setFps} />

        <div style={barDivider} />
        <button
          type="button"
          style={linkButton}
          onClick={() => window.snapit.recordVideoInstead()}
          title="Video is sharper & smaller for Slack, GitHub and Jira"
        >
          Prefer video? →
        </button>

        <div style={barDivider} />
        <button
          type="button"
          style={ghostIcon}
          onClick={() => window.snapit.closeOverlay()}
          title="Cancel (Esc)"
        >
          ✕
        </button>
        <button
          type="button"
          style={primaryButton('#ff3b30')}
          onClick={() =>
            void recorder.start({
              selectedId,
              fps,
              regionMode: region.regionMode,
              box: region.box,
              fallbackWidth: source.width
            })
          }
        >
          <span style={{ fontSize: 10 }}>●</span> Start GIF
        </button>
      </div>
    </div>
  )
}
