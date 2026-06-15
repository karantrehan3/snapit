import { contextBridge, ipcRenderer } from 'electron'

export type Frame = {
  dataUrl: string
  width: number
  height: number
  scaleFactor: number
}

/** What the overlay renderer needs to know about the current capture session. */
export type CaptureSession =
  | { mode: 'screenshot'; frame: Frame }
  | { mode: 'record' }

const api = {
  /** Fetch the current capture session (mode + frozen frame for screenshots). */
  getSession: (): Promise<CaptureSession | null> => ipcRenderer.invoke('capture:get-session'),
  /** Copy a (cropped) PNG data URL to the clipboard; closes the overlay. */
  copyImage: (dataUrl: string): void => ipcRenderer.send('capture:copy', dataUrl),
  /** Dismiss the capture overlay (e.g. on Esc / cancel). */
  closeOverlay: (): void => ipcRenderer.send('overlay:close')
}

contextBridge.exposeInMainWorld('snapit', api)

export type SnapitApi = typeof api
