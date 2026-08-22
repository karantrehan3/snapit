/**
 * The retention rules behind "save the last N seconds".
 *
 * A recording is kept as encoded video packets plus raw audio samples rather than a
 * growing muxed file, so the front can be dropped as it ages out. Muxing happens once,
 * at save time, over whatever the buffer still holds.
 *
 * Two constraints drive everything here:
 *  - video can only start at a keyframe, so the window is trimmed back to the last one
 *    at or before the target — the buffer therefore holds *at least* the window, never less;
 *  - audio must start no later than the video, or the two drift apart on playback.
 *
 * Pure, so the alignment can be tested without an encoder.
 */

export type VideoPacketRecord = {
  data: Uint8Array
  isKey: boolean
  timestampSec: number
  durationSec: number
}

export type AudioSampleRecord = {
  /** Interleaved f32 PCM, copied out of the AudioData so no decoder resource is held open. */
  data: Float32Array
  numberOfChannels: number
  sampleRate: number
  timestampSec: number
  durationSec: number
}

/** No window: keep the whole recording, the way snapit always has. */
export const KEEP_EVERYTHING = null
export type RetroWindow = number | typeof KEEP_EVERYTHING

/**
 * Index of the first packet to keep so the buffer still covers `windowSec` ending at
 * `nowSec`. Always a keyframe, and always at or before the target — trimming to the
 * *next* keyframe would hand back less than was asked for.
 */
export function retentionStart(
  packets: readonly Pick<VideoPacketRecord, 'timestampSec' | 'isKey'>[],
  windowSec: RetroWindow,
  nowSec: number
): number {
  if (windowSec === KEEP_EVERYTHING) return 0
  const target = nowSec - windowSec
  let start = 0
  for (let i = 0; i < packets.length; i++) {
    if (packets[i].isKey && packets[i].timestampSec <= target) start = i
  }
  return start
}

/** Drop the packets no longer needed to serve the window. Cheap enough to run per keyframe. */
export function pruneVideo(
  packets: readonly VideoPacketRecord[],
  windowSec: RetroWindow,
  nowSec: number
): VideoPacketRecord[] {
  const start = retentionStart(packets, windowSec, nowSec)
  return start === 0 ? packets.slice() : packets.slice(start)
}

/** Drop audio that ends before the video does — anything still overlapping is kept. */
export function pruneAudio(samples: readonly AudioSampleRecord[], startSec: number): AudioSampleRecord[] {
  return samples.filter((s) => s.timestampSec + s.durationSec > startSec)
}

export type TrimResult = {
  video: VideoPacketRecord[]
  audio: AudioSampleRecord[]
  /** The recording time the kept window starts at, subtracted from every timestamp. */
  startSec: number
}

/**
 * The window to mux, with both tracks rebased so the file starts at zero. A muxer that
 * is handed packets starting at t=41.6s writes 41.6 seconds of nothing before the first
 * frame.
 */
export function trimForSave(
  video: readonly VideoPacketRecord[],
  audio: readonly AudioSampleRecord[],
  windowSec: RetroWindow,
  nowSec: number
): TrimResult {
  const keptVideo = pruneVideo(video, windowSec, nowSec)
  const startSec = keptVideo[0]?.timestampSec ?? 0
  const keptAudio = pruneAudio(audio, startSec)
  return {
    startSec,
    video: keptVideo.map((p) => ({ ...p, timestampSec: p.timestampSec - startSec })),
    // Audio may start slightly before the video after keyframe alignment; clamping to
    // zero keeps the muxer happy without shifting the samples out of sync.
    audio: keptAudio.map((s) => ({ ...s, timestampSec: Math.max(0, s.timestampSec - startSec) }))
  }
}
