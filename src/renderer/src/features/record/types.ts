export type Phase = 'setup' | 'recording'
export type Mode = 'full' | 'region'
export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

/** Everything the recorder needs to start a capture. */
export type RecordParams = {
  selectedId: string
  systemAudio: boolean
  mic: boolean
  fps: number
  regionMode: boolean
  box: Rect | null
  fallbackWidth: number
}
