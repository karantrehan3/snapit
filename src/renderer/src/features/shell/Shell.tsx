import { Suspense, useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button } from '@renderer/components/Button'
import { Sidebar } from './Sidebar'
import { initialRoute, ROUTES, type Route } from './routes'
import { useShellStatus } from './useShellStatus'
import { app, bar, barSpacer, barTitle, main, routeBare, routeInner, routeScroll } from './styles'

/**
 * snapit, open.
 *
 * The whole app in one window. Getting here meant deleting four windows and most of a
 * tray menu: Captures, Settings, About and the Claude Code items were each their own
 * surface reached from a dropdown, which is why the app had no state you could call
 * "open" and nowhere to land.
 *
 * This file does one thing — hold the route and lay out the frame around it. What a route
 * *is* lives in `routes.ts`, what the sidebar shows lives in `Sidebar.tsx`, and how the
 * status stays current lives in `useShellStatus.ts`. Adding a section touches the registry
 * and nothing here.
 *
 * Route is state rather than a URL. The window is reused, so the hash only picks the
 * route to *open* on — the tray's "Open snapit" and a future deep link both work, and
 * nothing has to keep a URL in step with a click.
 */
export function Shell(): ReactElement {
  const [route, setRoute] = useState<Route>(() => initialRoute(window.location.hash))
  // Which capture a route was asked to land on, when it was asked from somewhere else.
  const [focusCapture, setFocusCapture] = useState<string | null>(null)
  const { status, settings, captures } = useShellStatus()

  const go = useCallback((next: Route, capture?: string) => {
    setRoute(next)
    setFocusCapture(capture ?? null)
  }, [])

  // A capture that has just finished saving. Main opens this window and names it, so the
  // end of a recording lands on the recording rather than in Finder.
  useEffect(() => window.snapit.onShowCapture((path) => go('captures', path)), [go])

  // An image opened for editing — from the Overview, from a capture's Edit button, or
  // from Finder's "Open With". It used to be its own window; it is a route now, so the
  // sidebar and the capture list stay where they were.
  useEffect(() => window.snapit.onEditImage(() => go('edit')), [go])

  // Saved, saved-as, or dismissed. Back to the captures, which is where an edited
  // screenshot now lives rather than behind a window that just closed.
  useEffect(() => window.snapit.onEditClosed(() => go('captures')), [go])

  const spec = ROUTES[route]
  const View = spec.view

  return (
    <div style={app}>
      <Sidebar route={route} counts={{ captures }} status={status} settings={settings} onGo={go} />

      <div style={main}>
        <header style={bar}>
          <h1 style={barTitle}>{spec.label}</h1>
          <span style={barSpacer} />
          {/* Only what is contextual. Starting a capture is the sidebar's job; stopping
              one is urgent and belongs wherever you happen to be looking. */}
          {status?.sessionPhase && (
            <Button variant="danger" size="sm" icon="stop" onClick={() => window.snapit.stopWebCapture()}>
              Stop and save
            </Button>
          )}
        </header>

        <Suspense fallback={null}>
          {spec.bare ? (
            // Two panes manage their own scrolling, so the shell must not add another.
            <div style={routeBare}>
              <View status={status} settings={settings} go={go} focusCapture={focusCapture} />
            </div>
          ) : (
            <div style={routeScroll}>
              <div style={routeInner}>
                <View status={status} settings={settings} go={go} focusCapture={focusCapture} />
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
