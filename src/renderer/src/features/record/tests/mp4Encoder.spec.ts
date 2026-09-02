import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * mp4Encoder drives WebCodecs and mediabunny, neither of which exists in a node test env, so
 * both are faked. The point is not to test the encoder libraries — it is to pin the decisions
 * mp4Encoder makes around them, which is where the bugs actually were: probing the *whole*
 * config, falling back when constant quality is unavailable, passing the quantizer only in
 * quantizer mode, and refusing to report success when nothing was captured.
 */

const state = vi.hoisted(() => ({
  /** Decides which configs the fake encoder claims to support. */
  supports: (_config: Record<string, unknown>) => true,
  configured: [] as Record<string, unknown>[],
  encodeCalls: [] as { options: Record<string, unknown> }[],
  flushed: 0,
  closed: 0,
  finalized: 0,
  cancelled: 0,
  videoTracks: [] as unknown[],
  audioTracks: [] as unknown[],
  frames: [] as { closed: boolean }[],
  /** Lets a test trigger the encoder's async error callback, as a bad config does. */
  fireError: null as ((e: unknown) => void) | null,
  /** Set to make the fake audio source fail, as an unsupported AAC profile does. */
  audioFailure: null as Error | null,
  outputBytes: new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer | null
}))

vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = null
  }
  class Mp4OutputFormat {}
  class EncodedVideoPacketSource {
    constructor(public codec: string) {}
    async add(): Promise<void> {}
  }
  class MediaStreamAudioTrackSource {
    errorPromise = state.audioFailure ? Promise.reject(state.audioFailure) : new Promise<void>(() => {})
    constructor(
      public track: unknown,
      public config: unknown
    ) {}
  }
  class Output {
    target = new BufferTarget()
    constructor(public opts: unknown) {}
    addVideoTrack(source: unknown, meta: unknown): void {
      state.videoTracks.push({ source, meta })
    }
    addAudioTrack(source: unknown): void {
      state.audioTracks.push(source)
    }
    async start(): Promise<void> {}
    async finalize(): Promise<void> {
      state.finalized++
      this.target.buffer = state.outputBytes
    }
    async cancel(): Promise<void> {
      state.cancelled++
    }
  }
  return {
    BufferTarget,
    Mp4OutputFormat,
    EncodedVideoPacketSource,
    MediaStreamAudioTrackSource,
    Output,
    EncodedPacket: { fromEncodedChunk: (c: unknown) => c }
  }
})

class FakeVideoEncoder {
  state = 'unconfigured'
  encodeQueueSize = 0
  constructor(private cbs: { output: (c: unknown, m: unknown) => void; error: (e: unknown) => void }) {
    state.fireError = (e) => this.cbs.error(e)
  }
  static async isConfigSupported(config: Record<string, unknown>): Promise<{ supported: boolean }> {
    return { supported: state.supports(config) }
  }
  configure(config: Record<string, unknown>): void {
    state.configured.push(config)
    this.state = 'configured'
  }
  encode(_frame: unknown, options: Record<string, unknown>): void {
    state.encodeCalls.push({ options })
    this.cbs.output({ chunk: true }, { decoderConfig: {} })
  }
  async flush(): Promise<void> {
    state.flushed++
  }
  close(): void {
    state.closed++
    this.state = 'closed'
  }
  addEventListener(): void {}
}

class FakeVideoFrame {
  closed = false
  constructor(
    public source: unknown,
    public init: { timestamp: number; duration: number }
  ) {
    state.frames.push(this)
  }
  close(): void {
    this.closed = true
  }
}

const canvas = { width: 1920, height: 1246 } as unknown as HTMLCanvasElement

async function makeEncoder(
  audioTrack: unknown = null,
  quality?: 'high' | 'balanced' | 'small',
  onAudioLost?: (reason: string) => void
) {
  const { createMp4Encoder } = await import('../mp4Encoder')
  return createMp4Encoder({
    canvas,
    width: 1920,
    height: 1246,
    fps: 30,
    audioTrack: audioTrack as never,
    ...(quality ? { quality } : {}),
    ...(onAudioLost ? { onAudioLost } : {})
  })
}

beforeEach(() => {
  state.supports = () => true
  state.configured = []
  state.encodeCalls = []
  state.flushed = 0
  state.closed = 0
  state.finalized = 0
  state.cancelled = 0
  state.videoTracks = []
  state.audioTracks = []
  state.frames = []
  state.fireError = null
  state.audioFailure = null
  state.outputBytes = new Uint8Array([1, 2, 3, 4]).buffer
  vi.stubGlobal('VideoEncoder', FakeVideoEncoder)
  vi.stubGlobal('VideoFrame', FakeVideoFrame)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createMp4Encoder — choosing a configuration', () => {
  it('uses constant quality when the platform supports it', async () => {
    await makeEncoder()
    expect(state.configured[0].bitrateMode).toBe('quantizer')
    expect(state.configured[0].latencyMode).toBe('quality')
  })

  it('falls back to a bitrate target when quantizer mode is unsupported', async () => {
    // This is the real regression: the GPU-backed encoder provides quantizer mode and the
    // software one does not, so a build with hardware acceleration disabled must not ask.
    state.supports = (c) => c.bitrateMode !== 'quantizer'
    await makeEncoder()
    expect(state.configured[0].bitrateMode).toBe('variable')
    expect(state.configured[0].bitrate).toBeGreaterThan(0)
  })

  it('probes the complete config, not just codec and dimensions', async () => {
    // A probe that ignored bitrateMode would report the quantizer config supported here.
    const seen: Record<string, unknown>[] = []
    state.supports = (c) => {
      seen.push(c)
      return c.bitrateMode !== 'quantizer'
    }
    await makeEncoder()
    expect(seen.every((c) => 'bitrateMode' in c && 'latencyMode' in c)).toBe(true)
  })

  it('throws when nothing is supported rather than configuring blindly', async () => {
    state.supports = () => false
    await expect(makeEncoder()).rejects.toThrow(/no supported/i)
  })

  it('throws when WebCodecs is missing entirely', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    await expect(makeEncoder()).rejects.toThrow(/VideoEncoder unavailable/i)
  })
})

describe('createMp4Encoder — encoding frames', () => {
  it('passes the quantizer only in quantizer mode', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    expect(state.encodeCalls[0].options.avc).toEqual({ quantizer: expect.any(Number) })
  })

  it('omits the quantizer in bitrate mode, where it is not accepted', async () => {
    state.supports = (c) => c.bitrateMode !== 'quantizer'
    const enc = await makeEncoder()
    await enc.addFrame(0)
    expect(state.encodeCalls[0].options.avc).toBeUndefined()
  })

  it('makes the first frame a key frame', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    expect(state.encodeCalls[0].options.keyFrame).toBe(true)
  })

  it('spaces key frames by the configured interval, not by frame count', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0) // key
    await enc.addFrame(0.5) // too soon
    await enc.addFrame(1.9) // still too soon
    await enc.addFrame(2.0) // 2s since the last key frame
    expect(state.encodeCalls.map((c) => c.options.keyFrame)).toEqual([true, false, false, true])
  })

  it('closes every frame it creates, so decoded frames are not leaked', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    await enc.addFrame(0.1)
    expect(state.frames).toHaveLength(2)
    expect(state.frames.every((f) => f.closed)).toBe(true)
  })

  it('stamps timestamps in microseconds from the supplied seconds', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(1.5)
    expect(state.frames[0].init.timestamp).toBe(1_500_000)
  })

  it('surfaces an asynchronous encoder failure on the next frame', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    state.fireError?.(new DOMException('Unsupported configuration parameters.', 'OperationError'))
    await expect(enc.addFrame(0.1)).rejects.toThrow(/Unsupported configuration parameters/)
  })
})

describe('createMp4Encoder — finishing', () => {
  it('flushes, closes and finalizes, then returns the bytes', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    const bytes = await enc.finish()
    expect(state.flushed).toBe(1)
    expect(state.closed).toBe(1)
    expect(state.finalized).toBe(1)
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4])
  })

  it('refuses to report success when no frames were captured', async () => {
    // Otherwise an empty file is written, or the caller silently skips saving — which is
    // indistinguishable from "recording is broken".
    const enc = await makeEncoder()
    await expect(enc.finish()).rejects.toThrow(/no frames were captured/i)
    expect(state.finalized).toBe(0)
  })

  it('throws rather than returning an empty file if the muxer produced nothing', async () => {
    state.outputBytes = new ArrayBuffer(0)
    const enc = await makeEncoder()
    await enc.addFrame(0)
    await expect(enc.finish()).rejects.toThrow(/no output/i)
  })

  it('reports an encoder failure instead of saving a partial recording', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    state.fireError?.(new DOMException('boom', 'OperationError'))
    await expect(enc.finish()).rejects.toThrow(/boom/)
  })

  it('does not encode after finishing, so nothing hits a closed codec', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    await enc.finish()
    const before = state.encodeCalls.length
    await enc.addFrame(1)
    expect(state.encodeCalls).toHaveLength(before)
  })
})

describe('createMp4Encoder — teardown and audio', () => {
  it('abort closes the codec and cancels the output without finalizing', async () => {
    const enc = await makeEncoder()
    await enc.addFrame(0)
    enc.abort()
    expect(state.closed).toBe(1)
    expect(state.cancelled).toBe(1)
    expect(state.finalized).toBe(0)
  })

  it('ignores frames after abort', async () => {
    const enc = await makeEncoder()
    enc.abort()
    await enc.addFrame(0)
    expect(state.encodeCalls).toHaveLength(0)
  })

  it('reports the reason when the audio source fails, instead of only logging it', async () => {
    // The failure this exists for: mediabunny drops an audio track that produced no
    // packets and finalizes anyway, so a rejected errorPromise was the only sign that a
    // recording had come back silent — and it went to the console.
    state.audioFailure = new Error('mp4a.40.29 is not supported by this browser')
    const told: string[] = []
    await makeEncoder({ kind: 'audio' }, undefined, (reason) => told.push(reason))
    await Promise.resolve()
    await Promise.resolve()
    expect(told).toEqual(['mp4a.40.29 is not supported by this browser'])
  })

  it('adds an audio track only when one is supplied', async () => {
    await makeEncoder()
    expect(state.audioTracks).toHaveLength(0)
    state.audioTracks = []
    await makeEncoder({ kind: 'audio' })
    expect(state.audioTracks).toHaveLength(1)
  })

  it('always adds the video track, with the frame rate as metadata', async () => {
    await makeEncoder()
    expect(state.videoTracks).toHaveLength(1)
    expect((state.videoTracks[0] as { meta: { frameRate: number } }).meta.frameRate).toBe(30)
  })
})

describe('createMp4Encoder — quality presets', () => {
  it('encodes with the requested preset’s quantizer', async () => {
    const { QUALITY_PRESETS } = await import('../quality')
    const enc = await makeEncoder(null, 'small')
    await enc.addFrame(0)
    expect((state.encodeCalls[0].options.avc as { quantizer: number }).quantizer).toBe(
      QUALITY_PRESETS.small.quantizer
    )
  })

  it('uses a coarser quantizer for a smaller preset than a higher one', async () => {
    const high = await makeEncoder(null, 'high')
    await high.addFrame(0)
    const highQp = (state.encodeCalls[0].options.avc as { quantizer: number }).quantizer
    state.encodeCalls = []
    const small = await makeEncoder(null, 'small')
    await small.addFrame(0)
    const smallQp = (state.encodeCalls[0].options.avc as { quantizer: number }).quantizer
    expect(smallQp).toBeGreaterThan(highQp)
  })

  it('defaults to the balanced preset when none is given', async () => {
    const { QUALITY_PRESETS } = await import('../quality')
    const enc = await makeEncoder()
    await enc.addFrame(0)
    expect((state.encodeCalls[0].options.avc as { quantizer: number }).quantizer).toBe(
      QUALITY_PRESETS.balanced.quantizer
    )
  })

  it('carries the preset into the bitrate fallback too', async () => {
    state.supports = (c) => c.bitrateMode !== 'quantizer'
    const high = await makeEncoder(null, 'high')
    const highRate = state.configured[0].bitrate as number
    state.configured = []
    await makeEncoder(null, 'small')
    const smallRate = state.configured[0].bitrate as number
    expect(highRate).toBeGreaterThan(smallRate)
    void high
  })
})
