import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output
} from 'mediabunny'
import { AUDIO_BITRATE, KEY_FRAME_INTERVAL_SEC, encoderPlans, type EncoderPlan } from './encoderConfig'
import { errorMessage } from '@renderer/lib/errorMessage'

/** How many frames may sit in the encoder before we stop handing it more. */
const MAX_QUEUED_FRAMES = 4

export type Mp4Encoder = {
  /** Encode the canvas as it stands now, at `timestampSec` from the start of the recording. */
  addFrame: (timestampSec: number) => Promise<void>
  /** Flush, mux and return the finished MP4. */
  finish: () => Promise<Uint8Array>
  /** Tear down without producing a file. */
  abort: () => void
}

export type Mp4EncoderOptions = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  fps: number
  /** Mixed mic/system audio, or null for a silent recording. */
  audioTrack: MediaStreamAudioTrack | null
}

/**
 * First plan this build will actually accept.
 *
 * The whole config is probed, not just codec and dimensions: `bitrateMode: 'quantizer'`
 * needs the GPU-backed encoder, and a partial probe reports it supported on the software
 * path where it is not — after which configure() fails asynchronously and closes the codec.
 */
async function pickPlan(width: number, height: number, fps: number): Promise<EncoderPlan> {
  for (const plan of encoderPlans(width, height, fps)) {
    try {
      const support = await VideoEncoder.isConfigSupported(plan.config)
      if (support.supported) return plan
    } catch {
      // Malformed-for-this-build config; try the next.
    }
  }
  throw new Error(`no supported H.264 encoder configuration for ${width}x${height}`)
}

/**
 * Records the canvas to an MP4 using WebCodecs, muxed by mediabunny.
 *
 * This replaces MediaRecorder, which offered no rate control and pinned the encoder to its
 * realtime path — measurably unable to exceed SSIM 0.949 whatever bitrate it was given.
 * Driving VideoEncoder directly gets `latencyMode: 'quality'`, and constant-quality
 * (`bitrateMode: 'quantizer'`) where the platform provides it. Which one we end up on is
 * decided by probing, not assumed: see encoderPlans for why, and for the measurements.
 *
 * Audio is handed to mediabunny wholesale — it pulls from the MediaStreamTrack and encodes
 * to AAC itself, so there is no second encoder to keep in sync here.
 */
export async function createMp4Encoder(opts: Mp4EncoderOptions): Promise<Mp4Encoder> {
  const { canvas, width, height, fps, audioTrack } = opts
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs VideoEncoder unavailable')

  const plan = await pickPlan(width, height, fps)
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const videoSource = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(videoSource, { frameRate: fps })
  if (audioTrack) {
    const audioSource = new MediaStreamAudioTrackSource(audioTrack, { codec: 'aac', bitrate: AUDIO_BITRATE })
    // mediabunny reports its internal audio failures only here; unhandled, they stay silent.
    void audioSource.errorPromise.catch((e) =>
      console.error(`[snapit] audio source error: ${errorMessage(e)}`)
    )
    output.addAudioTrack(audioSource)
  }
  await output.start()

  // Muxing is async; keep the promises so finish() can await them before finalizing.
  const muxed: Promise<unknown>[] = []
  let encodeError: Error | null = null

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxed.push(videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta))
    },
    error: (e) => {
      // Logged, not just stored: a failure here closes the codec, so every later encode()
      // throws InvalidStateError and the real cause would otherwise be buried under them.
      console.error(`[snapit] video encoder error: ${errorMessage(e)}`)
      encodeError = e instanceof Error ? e : new Error(errorMessage(e))
    }
  })
  encoder.configure(plan.config)

  let lastKeyFrameSec = -Infinity
  let closed = false
  let framesEncoded = 0
  let pending: Promise<void> = Promise.resolve()

  /** Wait for the encoder to drain below the queue cap, so frames can't pile up unbounded. */
  const awaitCapacity = async (): Promise<void> => {
    while (encoder.encodeQueueSize > MAX_QUEUED_FRAMES && !closed) {
      await new Promise<void>((resolve) => {
        encoder.addEventListener('dequeue', () => resolve(), { once: true })
        // The event can race with a flush that already emptied the queue.
        setTimeout(resolve, 50)
      })
    }
  }

  const encodeFrame = async (timestampSec: number): Promise<void> => {
    if (closed) return
    if (encodeError) throw encodeError
    await awaitCapacity()
    // Re-check: finish() may have closed the codec while we waited for capacity, and
    // encoding into a closed codec throws.
    if (closed) return
    // Time-based rather than frame-counted, so a dropped frame can't drift the interval.
    const keyFrame = timestampSec - lastKeyFrameSec >= KEY_FRAME_INTERVAL_SEC
    if (keyFrame) lastKeyFrameSec = timestampSec
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(timestampSec * 1e6),
      duration: Math.round(1e6 / fps)
    })
    try {
      // The quantizer is only meaningful — and only accepted — in quantizer mode.
      encoder.encode(
        frame,
        plan.quantizer === null ? { keyFrame } : { keyFrame, avc: { quantizer: plan.quantizer } }
      )
      framesEncoded++
    } finally {
      frame.close()
    }
  }

  return {
    addFrame: (timestampSec) => {
      // Tracked so finish() can wait for a frame that's mid-encode rather than closing
      // the codec underneath it.
      pending = encodeFrame(timestampSec)
      return pending
    },

    finish: async () => {
      closed = true
      // The in-flight frame resolves or rejects on its own terms; either way we only need
      // it to be done before flushing.
      await pending.catch(() => {})
      await encoder.flush()
      encoder.close()
      await Promise.all(muxed)
      if (encodeError) throw encodeError
      // Without this the caller cannot tell "nothing was captured" from a healthy save,
      // and an empty file gets written or silently skipped.
      if (framesEncoded === 0) throw new Error('no frames were captured')
      await output.finalize()
      const buffer = (output.target as BufferTarget).buffer
      if (!buffer || buffer.byteLength === 0) throw new Error('encoder produced no output')
      return new Uint8Array(buffer)
    },

    abort: () => {
      closed = true
      if (encoder.state !== 'closed') encoder.close()
      void output.cancel().catch(() => {})
    }
  }
}
