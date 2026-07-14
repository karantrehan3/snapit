import { useState, type ReactElement } from 'react'
import type { DisplaySource } from '@preload/index'
import { useRecorder } from './useRecorder'
import { useSourcePicker } from './useSourcePicker'
import { useRegionSelect } from './useRegionSelect'
import { SourceDropdown } from './SourceDropdown'
import { FpsControl } from './FpsControl'
import { ModeToggle } from './ModeToggle'
import { RecordingPill } from './RecordingPill'
import {
  barDivider,
  centerHint,
  commandBar,
  DIM,
  errorText,
  ghostIcon,
  iconToggle,
  primaryButton,
  recordingBorder,
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
 * overlay is click-through apart from the draggable Stop pill.
 */
export function RecordOverlay({ source }: { source: DisplaySource }): ReactElement {
  const [systemAudio, setSystemAudio] = useState(true)
  const [mic, setMic] = useState(true)
  const [fps, setFps] = useState(60)

  const picker = useSourcePicker(source.id)
  const { selectedId, canRegion } = picker
  const region = useRegionSelect(canRegion)
  const recorder = useRecorder()

  if (recorder.phase === 'recording') {
    return (
      <>
        {region.regionMode && region.box && (
          <div
            style={{
              ...recordingBorder,
              left: region.box.x,
              top: region.box.y,
              width: region.box.w,
              height: region.box.h
            }}
          />
        )}
        <RecordingPill
          elapsed={recorder.elapsed}
          saving={recorder.saving}
          pillPos={recorder.pillPos}
          pillRef={recorder.pillRef}
          onGripMouseDown={recorder.onPillMouseDown}
          onStop={recorder.stop}
        />
      </>
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
              fallbackWidth: source.width
            })
          }
        >
          <span style={{ fontSize: 10 }}>●</span> Record
        </button>
      </div>
    </div>
  )
}
