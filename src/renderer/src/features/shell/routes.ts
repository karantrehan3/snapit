import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { IconName } from '@renderer/components/Icon'
import { About } from '@renderer/features/about/About'
import { Captures } from '@renderer/features/captures/Captures'
import { Settings } from '@renderer/features/settings/Settings'
import { Checks } from './Checks'
import { ClaudeCode } from './ClaudeCode'
import { Overview } from './Overview'

// Konva is ~1.4 MB and only this route needs it, so it must not sit in the chunk that
// paints the window.
const ImageEditorRoute = lazy(() =>
  import('@renderer/features/edit/ImageEditor').then((m) => ({ default: m.ImageEditor }))
)

// Analytics reads every HAR in the folder; its chart and tables have no business in the
// chunk that paints the window.
const Analytics = lazy(() => import('./Analytics').then((m) => ({ default: m.Analytics })))

/**
 * The window's sections.
 *
 * snapit used to navigate through a menu bar dropdown, and every section was its own OS
 * window: captures, settings, about, first run. Five windows and a menu, which is how
 * the app came to have no front door. These are the same surfaces as routes in one
 * window, and the tray is left with the actions.
 *
 * `soon` is on the list rather than absent because Phase 2 is the reason the shell has a
 * sidebar at all — a nav that has to grow a section later is a nav that gets redesigned
 * later. Showing where it goes costs one dimmed row.
 */
export type Route =
  | 'overview'
  | 'captures'
  | 'analytics'
  | 'checks'
  | 'claude'
  | 'settings'
  | 'about'
  | 'edit'

/**
 * What the shell needs to know about a route, and nothing it does not.
 *
 * `view` is here rather than in a switch inside the shell so that a route is declared in
 * exactly one place. The shell renders whatever the registry names; adding Checks means
 * adding a line to this file and touching nothing else.
 *
 * The props a view may ask for are deliberately narrow — the status the sidebar already
 * polls, and a way to send the user somewhere else. Anything more and every route would
 * start depending on the shell.
 */
export type RouteProps = {
  status: import('@preload/index').ShellStatus | null
  /** What the capture buttons read their chords from. */
  settings: import('@preload/index').Settings | null
  /**
   * Navigate, optionally naming the capture to select on arrival.
   *
   * Without the second argument the Overview's Recent rows went to the Captures route and
   * left whatever was already selected there — so clicking a named capture showed a
   * different one, which is a control that looks broken because it is.
   */
  go: (route: Route, focusCapture?: string) => void
  /** Path of the capture this route was asked to land on, or null. */
  focusCapture?: string | null
}

export type RouteView = ComponentType<RouteProps> | LazyExoticComponent<ComponentType<RouteProps>>

export type RouteSpec = {
  label: string
  icon: IconName
  view: RouteView
  /** Section heading this route sits under, when it starts a new one. */
  group?: string
  /** Not built yet: listed, dimmed, and not selectable. */
  soon?: boolean
  /** Routes that manage their own scrolling and padding, because they are two panes. */
  bare?: boolean
  /** Shown beside the label. `captures` is the only one with a count worth having. */
  count?: (counts: RouteCounts) => string | number | undefined
  /**
   * Reachable but not listed. The editor is a place you are sent — by opening an image,
   * or by editing a screenshot from its capture — never something you browse to, so a
   * permanent nav row for it would be a row that is empty most of the time.
   */
  unlisted?: boolean
}

/** What the shell already knows and a nav item may want to show. */
export type RouteCounts = { captures: number | null }

export const ROUTES: Record<Route, RouteSpec> = {
  overview: { label: 'Overview', icon: 'grid', view: Overview },
  captures: {
    label: 'Captures',
    icon: 'film',
    view: Captures,
    bare: true,
    count: (c) => c.captures ?? undefined
  },
  analytics: { label: 'Analytics', icon: 'chart', view: Analytics },
  checks: { label: 'Checks', icon: 'check', view: Checks, soon: true, count: () => 'soon' },
  claude: { label: 'Claude Code', icon: 'globe', view: ClaudeCode, group: 'This machine' },
  settings: { label: 'Settings', icon: 'gear', view: Settings },
  about: { label: 'About', icon: 'info', view: About },
  edit: { label: 'Edit image', icon: 'pen', view: ImageEditorRoute, bare: true, unlisted: true }
}

/** The sidebar's rows. `edit` is absent on purpose — see `unlisted`. */
export const ROUTE_ORDER: Route[] = [
  'overview',
  'captures',
  'analytics',
  'checks',
  'claude',
  'settings',
  'about'
]

const ALL = new Set<string>(ROUTE_ORDER)

/**
 * Which route to open on. The window is reused, so the hash is only ever the *initial*
 * route — everything after that is state, and the URL is not rewritten to match.
 */
export function initialRoute(hash: string): Route {
  const asked = hash.replace(/^#/, '').split('/')[1] ?? ''
  return ALL.has(asked) && !ROUTES[asked as Route].soon ? (asked as Route) : 'overview'
}
