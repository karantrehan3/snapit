import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ENCODE_SAMPLE_RATE, mixAudio } from '../audioMix'

/**
 * The bug these pin down: a bare `new AudioContext()` takes the audio device's sample
 * rate, and opening a Bluetooth microphone drops that device to 16 kHz. mediabunny reads
 * a 16 kHz track as HE-AAC v2, which Chromium cannot encode, so the audio source errored
 * and the recording saved silently — video only, no complaint.
 *
 * So what is worth asserting is not the mixing. It is that the rate is ours, on every
 * path, including the single-source one that used to skip the graph entirely.
 */

type FakeContext = {
  options: AudioContextOptions
  destination: { connected: unknown[] }
  sources: MediaStreamAudioTrack[][]
}

const track = (label: string): MediaStreamAudioTrack =>
  ({ label, kind: 'audio' }) as unknown as MediaStreamAudioTrack

function fakeContexts(): { made: FakeContext[]; make: (o: AudioContextOptions) => AudioContext } {
  const made: FakeContext[] = []
  return {
    made,
    make: (options) => {
      const destination = { connected: [] as unknown[] }
      const context: FakeContext = { options, destination, sources: [] }
      made.push(context)
      return {
        createMediaStreamDestination: () => ({
          stream: { getAudioTracks: () => [track('mixed')] }
        }),
        createMediaStreamSource: (stream: MediaStream) => {
          context.sources.push(stream.getAudioTracks() as unknown as MediaStreamAudioTrack[])
          return { connect: (node: unknown) => destination.connected.push(node) }
        }
      } as unknown as AudioContext
    }
  }
}

beforeEach(() => {
  // Constructed inside mixAudio to wrap each track; node has no MediaStream.
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private tracks: MediaStreamAudioTrack[] = []) {}
      getAudioTracks(): MediaStreamAudioTrack[] {
        return this.tracks
      }
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mixAudio', () => {
  it('returns null when there is nothing to record, so no context is opened', () => {
    const { made, make } = fakeContexts()

    expect(mixAudio([], make)).toBeNull()
    expect(made).toHaveLength(0)
  })

  it('pins the sample rate rather than inheriting the audio device’s', () => {
    const { made, make } = fakeContexts()

    mixAudio([track('system'), track('mic')], make)

    expect(made[0].options.sampleRate).toBe(ENCODE_SAMPLE_RATE)
  })

  it('resamples a lone track too, since a headset mic is the one that reports 16 kHz', () => {
    const { made, make } = fakeContexts()

    const mix = mixAudio([track('mic')], make)

    expect(mix?.track.label).toBe('mixed')
    expect(made[0].options.sampleRate).toBe(ENCODE_SAMPLE_RATE)
  })

  it('encodes at a rate AAC-LC covers, so mediabunny never reaches for HE-AAC', () => {
    // buildAudioCodecString picks mp4a.40.29 / mp4a.40.5 at or below 24 kHz.
    expect(ENCODE_SAMPLE_RATE).toBeGreaterThan(24_000)
  })

  it('feeds every source into one destination', () => {
    const { made, make } = fakeContexts()

    mixAudio([track('system'), track('mic')], make)

    expect(made[0].sources.map((s) => s[0].label)).toEqual(['system', 'mic'])
    expect(made[0].destination.connected).toHaveLength(2)
  })

  it('hands back the context, so the caller can close it when the recording ends', () => {
    const { made, make } = fakeContexts()

    const mix = mixAudio([track('mic')], make)

    expect(mix?.context).toBeDefined()
    expect(made).toHaveLength(1)
  })
})
