import { contextBridge, ipcRenderer } from 'electron'

export type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

/** A live-screen source for recording: desktopCapturer id + native pixel size. */
export type DisplaySource = { id: string; width: number; height: number }

/** What the overlay renderer needs to know about the current capture session. */
export type CaptureSession = { mode: 'screenshot'; frame: Frame } | { mode: 'record'; source: DisplaySource }

export type Settings = {
  screenshotHotkey: string
  recordHotkey: string
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
  /** Persist a finished recording (webm bytes); closes the overlay. Returns the path. */
  saveRecording: (data: ArrayBuffer): Promise<string> => ipcRenderer.invoke('record:save', data),
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
