import type { CSSProperties } from 'react'

/** Space reserved around the image and for the floating toolbar. */
export const CANVAS_PADDING = 24
export const TOOLBAR_RESERVE = 64

/** Largest scale that fits the native image inside the available area (never upscales). */
export function fitScale(imgW: number, imgH: number, winW: number, winH: number): number {
  const availW = winW - CANVAS_PADDING * 2
  const availH = winH - TOOLBAR_RESERVE - CANVAS_PADDING * 2
  if (imgW <= 0 || imgH <= 0) return 1
  return Math.min(availW / imgW, availH / imgH, 1)
}

export const editorRoot: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1e1e20',
  overflow: 'hidden',
  userSelect: 'none'
}

/** Outer box occupies the scaled footprint so flex centering reserves the right space. */
export function scaledFootprint(imgW: number, imgH: number, scale: number): CSSProperties {
  return {
    position: 'relative',
    width: imgW * scale,
    height: imgH * scale,
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)'
  }
}

/** Inner box holds the native-size Konva stage and is visually scaled to fit. */
export function stageScale(scale: number): CSSProperties {
  return { transform: `scale(${scale})`, transformOrigin: 'top left' }
}

export const toolbarPosition: CSSProperties = {
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)'
}

export const loadingHint: CSSProperties = {
  color: 'rgba(255, 255, 255, 0.6)',
  font: '14px -apple-system, system-ui, sans-serif'
}
