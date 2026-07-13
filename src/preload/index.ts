import { contextBridge, ipcRenderer } from 'electron'

export type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

/** A live-screen source for recording: desktopCapturer id + native pixel size. */
export type DisplaySource = { id: string; width: number; height: number }

/** A selectable capture source (a screen or a window) with a preview thumbnail. */
export type RecordSourceInfo = { id: string; name: string; type: 'screen' | 'window'; thumbnail: string }

/** What the overlay renderer needs to know about the current capture session. */
export type CaptureSession =
  | { mode: 'screenshot'; frame: Frame }
  | { mode: 'record'; source: DisplaySource }
  | { mode: 'gif'; source: DisplaySource }

export type Settings = {
  screenshotHotkey: string
  recordHotkey: string
  gifHotkey: string
  saveDir: string
}

const api = {
  /** Fetch the current capture session (mode + frozen frame for screenshots). */
  getSession: (): Promise<CaptureSession | null> => ipcRenderer.invoke('capture:get-session'),
  /** Copy a (cropped) PNG data URL to the clipboard; closes the overlay. */
  copyImage: (dataUrl: string): void => ipcRenderer.send('capture:copy', dataUrl),
  /** Save a PNG to the configured folder; returns the path. Closes the overlay. */
  saveImage: (dataUrl: string): Promise<string> => ipcRenderer.invoke('capture:save', dataUrl),
  /** Save-as via a native dialog; returns the path or null if cancelled. */
  saveImageAs: (dataUrl: string): Promise<string | null> => ipcRenderer.invoke('capture:save-as', dataUrl),
  /** Dismiss the capture overlay (e.g. on Esc / cancel). */
  closeOverlay: (): void => ipcRenderer.send('overlay:close'),
  /** Switch the current GIF setup to a video recording (better for Slack/GitHub/Jira). */
  recordVideoInstead: (): void => ipcRenderer.send('capture:switch-to-record'),
  /** List capturable sources (screens + windows) with preview thumbnails. */
  listSources: (): Promise<RecordSourceInfo[]> => ipcRenderer.invoke('record:list-sources'),
  /** Set the next recording's system/loopback audio + source id (before getDisplayMedia). */
  prepareRecording: (systemAudio: boolean, sourceId: string): Promise<void> =>
    ipcRenderer.invoke('record:prepare', { systemAudio, sourceId }),
  /** Persist a finished recording (bytes + container ext); closes the overlay. Returns the path. */
  saveRecording: (data: ArrayBuffer, ext: string): Promise<string> =>
    ipcRenderer.invoke('record:save', data, ext),
  /** Persist a finished GIF (encoded bytes); closes the overlay. Returns the path. */
  saveGif: (data: ArrayBuffer): Promise<string> => ipcRenderer.invoke('gif:save', data),
  /** Toggle overlay click-through while recording (the Stop pill stays interactive). */
  setMouseIgnore: (ignore: boolean): void => ipcRenderer.send('record:set-ignore-mouse', ignore),
  /** Subscribe to stop-recording requests (record hotkey pressed again). Returns an unsubscribe. */
  onStopRecording: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('record:stop', handler)
    return () => ipcRenderer.removeListener('record:stop', handler)
  },
  /** Settings. */
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', partial),
  browseDir: (): Promise<string | null> => ipcRenderer.invoke('settings:browse-dir')
}

contextBridge.exposeInMainWorld('snapit', api)

export type SnapitApi = typeof api
