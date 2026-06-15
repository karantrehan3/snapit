import type { ReactElement } from 'react'

/**
 * Record overlay — Phase 2 placeholder.
 *
 * Unlike the screenshot overlay, record mode does NOT freeze the frame: the
 * window is transparent so the live screen shows through. The full flow
 * (region select → ● Rec / ⏹ Stop → encode to video) lands in Phase 2. For now
 * this is a clearly-labeled stub proving the screenshot/record mode split.
 */
export function RecordOverlay(): ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          color: '#fff',
          fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 600 }}>🎥 Screen recording</div>
        <div style={{ opacity: 0.85, marginTop: 8 }}>
          Coming in Phase 2 — region select, ● Rec / ⏹ Stop, save to video.
        </div>
        <div style={{ opacity: 0.6, marginTop: 6, fontSize: 13 }}>Press Esc to close</div>
      </div>
    </div>
  )
}
