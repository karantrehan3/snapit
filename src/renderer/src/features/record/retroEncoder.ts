import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output
} from 'mediabunny'
import { AUDIO_BITRATE, KEY_FRAME_INTERVAL_SEC } from './encoderConfig'
import { DEFAULT_QUALITY, type QualityPreset } from './quality'
import { pickPlan, type Mp4Encoder } from './mp4Encoder'
import {
  KEEP_EVERYTHING,
  pruneAudio,
  pruneVideo,
  trimForSave,
  type AudioSampleRecord,
  type RetroWindow,
  type VideoPacketRecord
} from './retroBuffer'
import { errorMessage } from '@renderer/lib/errorMessage'

const MAX_QUEUED_FRAMES = 4

/**
 * `MediaStreamTrackProcessor` is Chromium-only and absent from lib.dom, so the shape
 * we use is declared here rather than widening the project's DOM types.
 */
type TrackProcessor = { readable: ReadableStream<AudioData> }
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => TrackProcessor
const trackProcessor = (): TrackProcessorCtor | null =>
  (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor ??
  null

export type RetroEncoderOptions = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  fps: number
  audioTrack: MediaStreamAudioTrack | null
  quality?: QualityPreset
  /** Seconds to keep, or KEEP_EVERYTHING for an untrimmed recording. */
  window: RetroWindow
  /**
   * `performance.now()` at the moment the recording began — the clock video frame
   * timestamps are already measured against. Audio is aligned onto the same origin.
   */
  startPerfMs: number
}

/** Interleaved f32 is what AudioSample takes back, so copy it out in that layout. */
const INTERLEAVED: AudioSampleFormat = 'f32'

/**
 * A recorder that can throw away everything but the last N seconds.
 *
 * The difference from `createMp4Encoder` is *when* muxing happens. There, packets go
 * straight into a mediabunny `Output` that accumulates the whole file and writes an
 * index over all of it — append-only, with no way to drop the front. Here nothing is
 * muxed until `finish()`: encoded video packets and raw audio samples are held in a
 * ring, trimmed back to the last keyframe covering the window, and only then handed to
 * a freshly created `Output`.
 *
 * Audio cannot go through `MediaStreamAudioTrackSource` for the same reason — it pulls
 * from the live track and encodes as it goes, offering no packet-level hook to trim.
 * Samples are read off the track directly, copied to plain PCM (so no decoder resource
 * is held open across the buffer), and encoded by mediabunny at save time from
 * `AudioSampleSource`. AAC still comes from mediabunny, which is what has always
 * produced these files.
 */
export async function createRetroEncoder(opts: RetroEncoderOptions): Promise<Mp4Encoder> {
  const { canvas, width, height, fps, audioTrack, quality = DEFAULT_QUALITY, window: retroWindow } = opts
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs VideoEncoder unavailable')

  const plan = await pickPlan(width, height, fps, quality)

  let videoPackets: VideoPacketRecord[] = []
  let audioSamples: AudioSampleRecord[] = []
  /** Held from the first chunk: the trimmed window's first packet still needs the avcC. */
  let videoMeta: EncodedVideoChunkMetadata | undefined
  let encodeError: Error | null = null
  let closed = false
  let framesEncoded = 0
  let latestSec = 0

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (!videoMeta && meta?.decoderConfig) videoMeta = meta
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      const timestampSec = chunk.timestamp / 1e6
      videoPackets.push({
        data,
        isKey: chunk.type === 'key',
        timestampSec,
        durationSec: (chunk.duration ?? 1e6 / fps) / 1e6
      })
      latestSec = Math.max(latestSec, timestampSec)
      // Only worth doing at a keyframe: that is the only place the window can move.
      if (chunk.type === 'key' && retroWindow !== KEEP_EVERYTHING) {
        videoPackets = pruneVideo(videoPackets, retroWindow, latestSec)
        audioSamples = pruneAudio(audioSamples, videoPackets[0]?.timestampSec ?? 0)
      }
    },
    error: (e) => {
      console.error(`[snapit] video encoder error: ${errorMessage(e)}`)
      encodeError = e instanceof Error ? e : new Error(errorMessage(e))
    }
  })
  encoder.configure(plan.config)

  // --- audio capture -------------------------------------------------------
  let audioReader: ReadableStreamDefaultReader<AudioData> | null = null
  if (audioTrack) {
    const Ctor = trackProcessor()
    if (!Ctor) {
      // Better a silent recording than a failed one; the caller already has the video.
      console.warn('[snapit] MediaStreamTrackProcessor unavailable — recording without audio')
    } else {
      const reader = new Ctor({ track: audioTrack }).readable.getReader()
      audioReader = reader
      // Audio timestamps come off the capture clock, which shares no origin with the
      // encode loop's. Pin the first sample to the recording time it actually arrived
      // at, then advance by the track's own deltas so the two stay rigid afterwards.
      let firstTrackTs: number | null = null
      let firstOffsetSec = 0
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done || !value) break
            if (closed) {
              value.close()
              break
            }
            if (firstTrackTs === null) {
              firstTrackTs = value.timestamp
              firstOffsetSec = Math.max(0, (performance.now() - opts.startPerfMs) / 1000)
            }
            const timestampSec = firstOffsetSec + (value.timestamp - firstTrackTs) / 1e6
            const frames = new Float32Array(value.numberOfFrames * value.numberOfChannels)
            value.copyTo(frames, { planeIndex: 0, format: INTERLEAVED })
            audioSamples.push({
              data: frames,
              numberOfChannels: value.numberOfChannels,
              sampleRate: value.sampleRate,
              timestampSec,
              durationSec: value.numberOfFrames / value.sampleRate
            })
            value.close()
          }
        } catch (e) {
          console.error(`[snapit] audio capture stopped: ${errorMessage(e)}`)
        }
      })()
    }
  }

  // --- video encode --------------------------------------------------------
  let lastKeyFrameSec = -Infinity
  let pending: Promise<void> = Promise.resolve()

  const awaitCapacity = async (): Promise<void> => {
    while (encoder.encodeQueueSize > MAX_QUEUED_FRAMES && !closed) {
      await new Promise<void>((resolve) => {
        encoder.addEventListener('dequeue', () => resolve(), { once: true })
        setTimeout(resolve, 50)
      })
    }
  }

  const encodeFrame = async (timestampSec: number): Promise<void> => {
    if (closed) return
    if (encodeError) throw encodeError
    await awaitCapacity()
    if (closed) return
    const keyFrame = timestampSec - lastKeyFrameSec >= KEY_FRAME_INTERVAL_SEC
    if (keyFrame) lastKeyFrameSec = timestampSec
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(timestampSec * 1e6),
      duration: Math.round(1e6 / fps)
    })
    try {
      encoder.encode(
        frame,
        plan.quantizer === null ? { keyFrame } : { keyFrame, avc: { quantizer: plan.quantizer } }
      )
      framesEncoded++
    } finally {
      frame.close()
    }
  }

  const stopAudio = async (): Promise<void> => {
    if (!audioReader) return
    try {
      await audioReader.cancel()
    } catch {
      // The track may already have ended; nothing to unwind.
    }
    audioReader = null
  }

  return {
    addFrame: (timestampSec) => {
      pending = encodeFrame(timestampSec)
      return pending
    },

    finish: async () => {
      closed = true
      await pending.catch(() => {})
      await encoder.flush()
      encoder.close()
      await stopAudio()
      if (encodeError) throw encodeError
      if (framesEncoded === 0) throw new Error('no frames were captured')

      const trimmed = trimForSave(videoPackets, audioSamples, retroWindow, latestSec)
      if (trimmed.video.length === 0) throw new Error('nothing left in the buffer to save')
      if (!videoMeta) throw new Error('encoder never produced a decoder configuration')

      // Everything below here is the muxing the non-retro encoder does as it goes.
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
      const videoSource = new EncodedVideoPacketSource('avc')
      output.addVideoTrack(videoSource, { frameRate: fps })
      const audioSource =
        trimmed.audio.length > 0 ? new AudioSampleSource({ codec: 'aac', bitrate: AUDIO_BITRATE }) : null
      if (audioSource) output.addAudioTrack(audioSource)
      await output.start()

      for (let i = 0; i < trimmed.video.length; i++) {
        const p = trimmed.video[i]
        const packet = new EncodedPacket(p.data, p.isKey ? 'key' : 'delta', p.timestampSec, p.durationSec)
        // The decoder config only has to ride the first packet, but it is the trimmed
        // window's first packet — not the recording's, which may be long gone.
        await videoSource.add(packet, i === 0 ? videoMeta : undefined)
      }

      if (audioSource) {
        for (const s of trimmed.audio) {
          const sample = new AudioSample({
            data: s.data,
            format: INTERLEAVED,
            numberOfChannels: s.numberOfChannels,
            sampleRate: s.sampleRate,
            timestamp: s.timestampSec
          })
          await audioSource.add(sample)
          sample.close()
        }
      }

      await output.finalize()
      const buffer = (output.target as BufferTarget).buffer
      if (!buffer || buffer.byteLength === 0) throw new Error('encoder produced no output')
      return new Uint8Array(buffer)
    },

    abort: () => {
      closed = true
      if (encoder.state !== 'closed') encoder.close()
      void stopAudio()
      videoPackets = []
      audioSamples = []
    }
  }
}
