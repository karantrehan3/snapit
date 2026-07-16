import type { CSSProperties } from 'react'
import type { Box } from '@renderer/lib/image'
import type { Editing } from '@renderer/features/annotate/types'

const TOOLBAR_HEIGHT = 44
const GAP = 8
const DIM = 'rgba(165, 165, 170, 0.42)'

export const overlayRoot: CSSProperties = { position: 'fixed', inset: 0, userSelect: 'none' }

/** Bright window into the frozen frame; everything outside is dimmed. */
export function selectionDim(box: Box): CSSProperties {
  return {
    position: 'fixed',
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 9999px ${DIM}`,
    outline: '3px dashed #ffffff',
    pointerEvents: 'none'
  }
}

export const fullDim: CSSProperties = { position: 'fixed', inset: 0, background: DIM, pointerEvents: 'none' }

export function cornerHandle(left: number, top: number, cursor: string): CSSProperties {
  return {
    position: 'fixed',
    left,
    top,
    width: 12,
    height: 12,
    transform: 'translate(-50%, -50%)',
    background: '#fff',
    border: '1.5px solid #4aa3ff',
    borderRadius: 2,
    cursor,
    pointerEvents: 'auto'
  }
}

export function textareaStyle(box: Box | null, editing: Editing): CSSProperties {
  return {
    position: 'fixed',
    left: (box?.x ?? 0) + editing.x,
    top: (box?.y ?? 0) + editing.y,
    margin: 0,
    padding: '2px 4px',
    // Visible boundary so it's clear the text box is active and where to type.
    border: '1px dashed #0a84ff',
    borderRadius: 3,
    outline: 'none',
    background: 'rgba(255, 255, 255, 0.85)',
    color: editing.fill,
    caretColor: editing.fill,
    fontSize: editing.fontSize,
    fontFamily: '-apple-system, system-ui, sans-serif',
    lineHeight: 1.2,
    resize: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre',
    minWidth: 60,
    minHeight: editing.fontSize + 8
  }
}

export const hintStyle: CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  color: '#fff',
  font: '14px -apple-system, system-ui, sans-serif',
  opacity: 0.85,
  pointerEvents: 'none'
}

export function toolbarPosition(sel: Box): CSSProperties {
  const below = sel.y + sel.h + GAP
  const top =
    below + TOOLBAR_HEIGHT <= window.innerHeight ? below : Math.max(GAP, sel.y - TOOLBAR_HEIGHT - GAP)
  const left = Math.min(Math.max(GAP, sel.x), Math.max(GAP, window.innerWidth - 420))
  return { top, left }
}
