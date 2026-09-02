import { useCallback, useEffect, useState } from 'react'
import type { Settings, ShellStatus } from '@preload/index'

/**
 * The state the sidebar reports, kept current.
 *
 * It polls, and that is not laziness. There is no event for a permission granted in
 * System Settings — it happens in another application — and none for an agent attaching
 * over MCP either, so the honest options are polling or showing something stale. Coming
 * back to the front is checked as well, because that is the moment after someone has
 * been away granting the permission.
 *
 * The capture count and the settings ride along for the same reason: they are wanted in
 * the same place, and a second poller for one integer and one object would be worse. The
 * settings are what the capture buttons read their chords from, so they have to be
 * current after somebody edits them on the Settings route.
 */

/** Often enough to be true, rarely enough to cost nothing while the window sits open. */
const POLL_MS = 4000

export type ShellState = {
  status: ShellStatus | null
  settings: Settings | null
  captures: number | null
  refresh: () => void
}

export function useShellStatus(): ShellState {
  const [status, setStatus] = useState<ShellStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [captures, setCaptures] = useState<number | null>(null)

  const refresh = useCallback(() => {
    void window.snapit.shellStatus().then(setStatus)
    void window.snapit.getSettings().then(setSettings)
    void window.snapit.listLibrary().then((list) => setCaptures(list.length))
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    const off = window.snapit.onLibraryChanged(refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      off()
    }
  }, [refresh])

  return { status, settings, captures, refresh }
}
