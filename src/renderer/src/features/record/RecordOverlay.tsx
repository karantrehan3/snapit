import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { CapturePrefs, DisplaySource, WorkArea } from '@preload/index'
import { useLiveSurface } from '../annotate-live/useLiveSurface'
import { useRecorder } from './useRecorder'
import { useSourcePicker } from './useSourcePicker'
import { useRegionSelect } from './useRegionSelect'
import { SourceDropdown } from './SourceDropdown'
import { FpsControl } from './FpsControl'
import { ModeToggle } from './ModeToggle'
import { QualityControl } from './QualityControl'
import { RetroControl } from './RetroControl'
import { Icon } from '@renderer/components/Icon'
import { webAppNudge } from './browserHint'
import type { RetroWindow } from './retroBuffer'
import type { QualityPreset } from './quality'
import { RecordingChrome } from './RecordingChrome'
import {
  barDivider,
  barSegmented,
  centerHint,
  commandBar,
  DIM,
  errorText,
  ghostIcon,
  iconToggle,
  nudgeDot,
  recordButton,
  regionBox,
  segment,
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
  prefs,
  workArea,
  auto,
  onReady
}: {
  source: DisplaySource
  /** How the bar was left last time. See main/capturePrefs.ts. */
  prefs: CapturePrefs
  workArea: WorkArea
  /** Set when snapit knows what to record: the browser window it just opened. */
  auto?: { sourceId: string }
  onReady?: () => void
}): ReactElement {
  const [systemAudio, setSystemAudio] = useState(prefs.systemAudio)
  const [mic, setMic] = useState(prefs.mic)
  const [fps, setFps] = useState(prefs.fps)
  const [quality, setQuality] = useState<QualityPreset>(prefs.quality)
  const [retroWindow, setRetroWindow] = useState<RetroWindow>(prefs.retroSec)

  // Saved when a capture starts, not on every toggle: pressing Record is the moment
  // someone means it, and a cancelled setup should not change what opens next time.
  const remember = (): void => {
    void window.snapit.setSettings({
      capture: { ...prefs, fps, quality, retroSec: retroWindow, systemAudio, mic }
    })
  }

  // The live desktop shows through immediately; signal on mount so main reveals us.
  useEffect(() => {
    const raf = requestAnimationFrame(() => onReady?.())
    return () => cancelAnimationFrame(raf)
  }, [onReady])

  const picker = useSourcePicker(source.id)
  const { selectedId, canRegion } = picker
  // The offer is permanently in the selector below; this only decides whether to point
  // at it. Usually it finds nothing, because a Chrome window on macOS is titled with
  // the page rather than the browser — and that is fine, the option is still there.
  const nudge = webAppNudge(picker.sources.find((s) => s.id === selectedId) ?? null)
  const region = useRegionSelect(canRegion)

  // `canRegion` means the source is the display this overlay covers, which is what makes
  // screen-space annotations map onto the frame 1:1 — a window or second-display capture
  // would stretch them onto a different area.
  const surface = useLiveSurface(canRegion)
  const recorder = useRecorder(surface.options)

  // Snapit opened the window and knows what to record, so the setup panel would only be
  // asking the user to confirm a choice already made for them. Start straight away.
  //
  // Audio comes from the saved prefs like every other recording. It used to be hardcoded
  // off here, which made every web capture silent — and narrating the bug while you
  // reproduce it is most of why anyone records one.
  const startedAuto = useRef(false)
  useEffect(() => {
    if (!auto || startedAuto.current) return
    startedAuto.current = true
    void recorder.start({
      selectedId: auto.sourceId,
      systemAudio,
      mic,
      fps,
      regionMode: false,
      box: null,
      annotatable: false,
      fallbackWidth: source.width,
      fallbackHeight: source.height,
      quality,
      retroWindow
    })
    // Deliberately once, on mount: re-running would start a second recording.
  }, [auto])

  if (auto && recorder.phase !== 'recording') {
    return (
      <div style={stage}>
        <div style={centerHint}>
          {recorder.error ? <span style={errorText}>{recorder.error}</span> : 'Starting capture…'}
        </div>
      </div>
    )
  }

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
        {/* The one decision worth making first: pixels only, or the whole story. A web
            app capture opens its own browser, so there is nothing to pick after this. */}
        <div style={barSegmented} title="What are you capturing?">
          <button type="button" style={segment(true)}>
            Screen
          </button>
          <button
            type="button"
            style={segment(false, nudge !== null)}
            onClick={() => window.snapit.captureWebApp()}
            title={nudge ?? 'Opens a browser snapit collects from: console, network, steps and a test'}
          >
            {nudge && <span style={nudgeDot} />}
            Web app
          </button>
        </div>

        <div style={barDivider} />
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
          aria-label="System audio"
          aria-pressed={systemAudio}
        >
          <Icon name="speaker" size={17} />
        </button>
        <button
          type="button"
          style={iconToggle(mic)}
          onClick={() => setMic((v) => !v)}
          title="Microphone"
          aria-label="Microphone"
          aria-pressed={mic}
        >
          <Icon name="mic" size={17} />
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
          onClick={() => {
            remember()
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
          }}
        >
          <span style={{ fontSize: 10 }}>●</span> Record
        </button>
      </div>
    </div>
  )
}
