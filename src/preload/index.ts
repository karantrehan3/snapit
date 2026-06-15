import { contextBridge, ipcRenderer } from 'electron'

export type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

/** What the overlay renderer needs to know about the current capture session. */
export type CaptureSession = { mode: 'screenshot'; frame: Frame } | { mode: 'record' }

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
  /** Settings. */
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', partial),
  browseDir: (): Promise<string | null> => ipcRenderer.invoke('settings:browse-dir')
}

contextBridge.exposeInMainWorld('snapit', api)

export type SnapitApi = typeof api
