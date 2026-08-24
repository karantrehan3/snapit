import { useEffect, useState, type ReactElement } from 'react'
import type { DisplaySource, WorkArea } from '@preload/index'
import { useLiveSurface } from '../annotate-live/useLiveSurface'
import { useRecorder } from './useRecorder'
import { useSourcePicker } from './useSourcePicker'
import { useRegionSelect } from './useRegionSelect'
import { SourceDropdown } from './SourceDropdown'
import { FpsControl } from './FpsControl'
import { ModeToggle } from './ModeToggle'
import { QualityControl } from './QualityControl'
import { RetroControl } from './RetroControl'
import { browserHint } from './browserHint'
import { DEFAULT_RETRO } from './retroWindow'
import type { RetroWindow } from './retroBuffer'
import { DEFAULT_QUALITY, type QualityPreset } from './quality'
import { RecordingChrome } from './RecordingChrome'
import {
  barDivider,
  centerHint,
  commandBar,
  hintAction,
  hintBar,
  DIM,
  errorText,
  ghostIcon,
  iconToggle,
  primaryButton,
  regionBox,
  stage
} from './styles'

/**
 * Record overlay — floating command bar.
 *
 * The live screen stays visible; a frosted-glass bar docks top-centre with the
 * source picker (popover), full/region toggle, fps, and system/mic audio. Region
 * mode dims the screen via the selection box. While recording, the region outline
 * stays on screen (excluded from the capture by content protection) and the
 * overlay is click-through apart from the draggable Stop pill — or fully
 * interactive while annotating.
 */
export function RecordOverlay({
  source,
  workArea,
  onReady
}: {
  source: DisplaySource
  workArea: WorkArea
  onReady?: () => void
}): ReactElement {
  const [systemAudio, setSystemAudio] = useState(true)
  const [mic, setMic] = useState(true)
  const [fps, setFps] = useState(60)
  const [quality, setQuality] = useState<QualityPreset>(DEFAULT_QUALITY)
  const [retroWindow, setRetroWindow] = useState<RetroWindow>(DEFAULT_RETRO)

  // The live desktop shows through immediately; signal on mount so main reveals us.
  useEffect(() => {
    const raf = requestAnimationFrame(() => onReady?.())
    return () => cancelAnimationFrame(raf)
  }, [onReady])

  const picker = useSourcePicker(source.id)
  const { selectedId, canRegion } = picker
  // Best-effort: a window title rarely names its browser on macOS, so the offer is made
  // for any window and simply worded more confidently when the name gives it away.
  const hint = browserHint(picker.sources.find((s) => s.id === selectedId) ?? null)
  const region = useRegionSelect(canRegion)

  // `canRegion` means the source is the display this overlay covers, which is what makes
  // screen-space annotations map onto the frame 1:1 — a window or second-display capture
  // would stretch them onto a different area.
  const surface = useLiveSurface(canRegion)
  const recorder = useRecorder(surface.options)

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

      {hint && (
        <div style={hintBar} onMouseDown={(e) => e.stopPropagation()}>
          <span>{hint.text}</span>
          <button type="button" style={hintAction} onClick={() => window.snapit.captureWebApp()}>
            Capture a web app instead
          </button>
        </div>
      )}

      <div style={commandBar} onMouseDown={(e) => e.stopPropagation()}>
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
        <RetroControl value={retroWindow} onChange={setRetroWindow} />

        <div style={barDivider} />
        <button
          type="button"
          style={iconToggle(systemAudio)}
          onClick={() => setSystemAudio((v) => !v)}
          title="System audio"
        >
          🔊
        </button>
        <button type="button" style={iconToggle(mic)} onClick={() => setMic((v) => !v)} title="Microphone">
          🎤
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
              systemAudio,
              mic,
              fps,
              regionMode: region.regionMode,
              box: region.box,
              annotatable: canRegion,
              fallbackWidth: source.width,
              fallbackHeight: source.height,
              quality,
              retroWindow
            })
          }
        >
          <span style={{ fontSize: 10 }}>●</span> Record
        </button>
      </div>
    </div>
  )
}
