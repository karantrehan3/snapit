import type { ReactElement } from 'react'

/**
 * The app's icons, as inline SVG.
 *
 * They were emoji and stray Unicode glyphs before — 🔊 🎤 ⚑ ⏹ ↶ on the chrome, ▭ ◯ ／ ▨
 * on the annotation toolbar. Each of those is a different font's idea of a shape: they
 * render at different weights on every platform, some fall back to a box, none take a
 * colour, and a row of them never lines up. `MoveIcon` in the annotation toolbar was
 * already the exception that proved it — this is that one icon, generalised.
 *
 * One 24-unit grid, stroked in `currentColor`, so an icon inherits whatever the control
 * around it is doing. Fills are used only where a shape is the meaning (a solid
 * redaction block, a stop square).
 */

export type IconName =
  | 'move'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'pen'
  | 'text'
  | 'redact'
  | 'redact-solid'
  | 'redact-pixelate'
  | 'undo'
  | 'redo'
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'grid'
  | 'chart'
  | 'gear'
  | 'info'
  | 'sidebar'
  | 'plus'
  | 'play'
  | 'external'
  | 'speaker'
  | 'mic'
  | 'flag'
  | 'stop'
  | 'grip'
  | 'globe'
  | 'star'
  | 'film'
  | 'image'
  | 'folder'
  | 'trash'
  | 'clipboard'
  | 'share'
  | 'alert'
  | 'check'
  | 'mute'

const PATHS: Record<IconName, ReactElement> = {
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  rect: <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  arrow: (
    <>
      <path d="M5 19L19 5" />
      <path d="M11 5h8v8" />
    </>
  ),
  line: <path d="M5 19L19 5" />,
  pen: (
    <>
      <path d="M4 20l4.5-1.2L20.2 7.1a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 0-2.8 0L5.2 15.5z" />
      <path d="M15.5 5.5l3 3" />
    </>
  ),
  text: (
    <>
      <path d="M5 6.5V5h14v1.5" />
      <path d="M12 5v14M9 19h6" />
    </>
  ),
  // Lines of text with one struck out — a square with a slash read as "forbidden".
  redact: (
    <>
      <path d="M4 6.5h16M4 17.5h10" />
      <rect x="4" y="10.25" width="16" height="3.5" rx="0.5" fill="currentColor" stroke="none" />
    </>
  ),
  'redact-solid': <rect x="3.5" y="6" width="17" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  // A framed checkerboard, so it contrasts with the solid block beside it at 13px.
  'redact-pixelate': (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
      <g fill="currentColor" stroke="none">
        <rect x="4.5" y="7" width="4" height="4" />
        <rect x="12.5" y="7" width="4" height="4" />
        <rect x="8.5" y="11" width="4" height="4" />
        <rect x="16.5" y="11" width="3" height="4" />
        <rect x="4.5" y="15" width="4" height="2" />
        <rect x="12.5" y="15" width="4" height="2" />
      </g>
    </>
  ),
  undo: (
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
      <path d="M8 5L4 9l4 4" />
    </>
  ),
  redo: (
    <>
      <path d="M20 9H9a5 5 0 0 0 0 10h6" />
      <path d="M16 5l4 4-4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  'chevron-left': <path d="M14.5 6l-6 6 6 6" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  // Bars rather than a line: what the Analytics route actually draws is counts per day.
  chart: (
    <>
      <path d="M4 20.5h16" />
      <rect x="5.5" y="12" width="3.5" height="6" rx="0.8" />
      <rect x="10.5" y="7.5" width="3.5" height="10.5" rx="0.8" />
      <rect x="15.5" y="10" width="3.5" height="8" rx="0.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.75" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  // A pane beside a narrower one: the control that collapses the capture list.
  sidebar: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  // Filled, because it is the one control on a player and an outline of it reads as a
  // shape rather than as the button you press.
  play: <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none" />,
  external: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="M19.5 4.5L11 13" />
      <path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2.2 3.75L17 12H6z" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />,
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </g>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <ellipse cx="12" cy="12" rx="4" ry="8.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.9l6-.8z" />,
  film: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3 12h18" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M4 17l4.5-4.5 3.5 3.5 3-3L20 17" />
    </>
  ),
  folder: (
    <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h3.8l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M16.5 10l4 4M20.5 10l-4 4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5L21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.75" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clipboard: (
    <>
      <path d="M9 4.5h6v3H9z" />
      <path d="M9 6H6.5A1.5 1.5 0 0 0 5 7.5v11A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H15" />
      <path d="M8.5 12h7M8.5 15.5h4.5" />
    </>
  ),
  share: (
    <>
      <path d="M12 3.5v11" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M7.5 11.5H6A1.5 1.5 0 0 0 4.5 13v6A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
    </>
  )
}

/**
 * `size` is the rendered box; the artwork is drawn on a 24-unit grid and scales to it.
 * An icon is decoration — the control around it carries the accessible name — so it is
 * hidden from assistive technology rather than announced twice.
 */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      {PATHS[name]}
    </svg>
  )
}
