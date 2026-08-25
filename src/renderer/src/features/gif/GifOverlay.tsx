import { useEffect, useState, type ReactElement } from 'react'
import { Icon } from '@renderer/components/Icon'
import type { DisplaySource, WorkArea } from '@preload/index'
import { useLiveSurface } from '../annotate-live/useLiveSurface'
import { useSourcePicker } from '../record/useSourcePicker'
import { useRegionSelect } from '../record/useRegionSelect'
import { SourceDropdown } from '../record/SourceDropdown'
import { FpsControl } from '../record/FpsControl'
import { ModeToggle } from '../record/ModeToggle'
import { QualityControl } from '../record/QualityControl'
import { RecordingChrome } from '../record/RecordingChrome'
import { useGifRecorder, type SilentFormat } from './useGifRecorder'
import { DEFAULT_QUALITY, type QualityPreset } from '../record/quality'
import { FormatToggle } from './FormatToggle'
import {
  barDivider,
  centerHint,
  commandBar,
  DIM,
  errorText,
  ghostIcon,
  linkButton,
  recordButton,
  regionBox,
  stage
} from '../record/styles'

const DEFAULT_FPS = 30

/**
 * Silent-capture overlay — floating command bar (mirrors RecordOverlay, minus audio).
 *
 * The live screen stays visible; a frosted-glass bar docks top-centre with the source picker
 * (popover), full/region toggle, frame rate and the output format. MP4 is the default: it is
 * roughly 8x smaller than GIF at better quality, and GIF stays for destinations that require
 * the format. A nudge offers the full recorder when audio is needed. While recording, the
 * region outline stays on screen (excluded from the capture by content protection); the Stop
 * pill is a draggable floater. Frames always route through a canvas in either format, so
 * annotation needs no pre-arming here.
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
  const [format, setFormat] = useState<SilentFormat>('mp4')
  const [quality, setQuality] = useState<QualityPreset>(DEFAULT_QUALITY)

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
        <QualityControl value={quality} onChange={setQuality} />

        <div style={barDivider} />
        <FormatToggle format={format} onChange={setFormat} />

        <div style={barDivider} />
        <button
          type="button"
          style={linkButton}
          onClick={() => window.snapit.recordVideoInstead()}
          title="Record with audio instead"
        >
          Need audio? →
        </button>

        <div style={barDivider} />
        <button
          type="button"
          style={ghostIcon}
          onClick={() => window.snapit.closeOverlay()}
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <Icon name="close" size={17} />
        </button>
        <button
          type="button"
          style={recordButton}
          onClick={() =>
            void recorder.start({
              selectedId,
              fps,
              regionMode: region.regionMode,
              box: region.box,
              fallbackWidth: source.width,
              format,
              quality
            })
          }
        >
          <span style={{ fontSize: 10 }}>●</span> Start {format === 'gif' ? 'GIF' : 'MP4'}
        </button>
      </div>
    </div>
  )
}
