import type { ReactElement } from 'react'
import type { Settings, ShellStatus } from '@preload/index'
import { Icon } from '@renderer/components/Icon'
import { APP_ICON } from '@renderer/lib/appIcon'
import { isConnected, mcpLabel } from '@renderer/lib/mcp'
import { NewCaptureMenu } from './NewCaptureMenu'
import { ROUTES, ROUTE_ORDER, type Route, type RouteCounts } from './routes'
import {
  brand,
  brandName,
  create,
  dot,
  livePulse,
  mark,
  nav,
  navCount,
  navGroup,
  navItem,
  sidebar,
  statusFoot,
  statusRow
} from './styles'

/**
 * The window's navigation, and the three things worth knowing without asking.
 *
 * The nav is generated from the route registry rather than written out, so a section is
 * declared in one file and appears here without this one changing. Above it is the one
 * control that starts anything — an application's create action belongs at the top of its
 * sidebar, not spread across the top bar as icons nobody can read.
 *
 * The footer is why the sidebar is worth its 202px. Screen Recording is the permission
 * that makes every other part of snapit look broken — macOS returns black frames rather
 * than an error — and a running session and an attached agent are both states you would
 * otherwise have to go looking for.
 */
export function Sidebar({
  route,
  counts,
  status,
  settings,
  onGo
}: {
  route: Route
  counts: RouteCounts
  status: ShellStatus | null
  settings: Settings | null
  onGo: (route: Route) => void
}): ReactElement {
  return (
    <div style={sidebar}>
      {/* The traffic lights sit over this strip, so nothing goes to their left. */}
      <div style={brand}>
        <span style={{ width: 62 }} />
        <img src={APP_ICON} alt="" style={mark} />
        <span style={brandName}>snapit</span>
      </div>

      {/* Above the nav, because starting a capture is not a place you navigate to. */}
      <div style={create}>
        <NewCaptureMenu settings={settings} />
      </div>

      <nav style={nav}>
        {ROUTE_ORDER.filter((key) => !ROUTES[key].unlisted).map((key) => {
          const item = ROUTES[key]
          const badge = item.count?.(counts)
          return (
            <div key={key}>
              {item.group && <div style={navGroup}>{item.group}</div>}
              <button
                type="button"
                style={navItem(route === key, item.soon === true)}
                aria-current={route === key || undefined}
                disabled={item.soon}
                onClick={() => onGo(key)}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
                {badge !== undefined && <span style={navCount}>{badge}</span>}
              </button>
            </div>
          )
        })}
      </nav>

      <div style={statusFoot}>
        <Status status={status} />
      </div>
    </div>
  )
}

function Status({ status }: { status: ShellStatus | null }): ReactElement {
  if (!status) return <span style={statusRow}>Checking…</span>

  const granted = status.screenPermission === 'granted' || status.screenPermission === 'not-applicable'
  const live = status.sessionPhase !== null

  return (
    <>
      <span style={statusRow}>
        <span style={dot(granted ? 'ok' : 'bad')} />
        {granted ? 'Screen Recording on' : 'Screen Recording off'}
      </span>
      <span style={statusRow}>
        <span style={dot(isConnected(status.mcp) ? 'ok' : 'idle')} />
        {mcpLabel(status.mcp)}
      </span>
      <span style={statusRow}>
        {/* The one status that is happening rather than being, so it pulses. */}
        <span style={{ ...dot(live ? 'bad' : 'idle'), ...(live ? livePulse : {}) }} />
        {status.sessionPhase === 'capturing'
          ? 'Capturing a web app'
          : status.sessionPhase === 'setup'
            ? 'Session getting ready'
            : 'No session running'}
      </span>
    </>
  )
}
