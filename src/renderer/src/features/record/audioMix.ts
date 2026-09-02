/**
 * Sample rate every recording's audio is encoded at.
 *
 * Ours rather than the device's, deliberately. Opening the microphone on a Bluetooth
 * headset switches it to the hands-free profile, which runs the shared audio device at
 * 16 kHz — and a bare `new AudioContext()` adopts whatever the device is doing. mediabunny
 * reads a 16 kHz stereo track as HE-AAC v2 (`mp4a.40.29`), Chromium has no encoder for
 * that profile, and the failure lands in a promise nobody was watching: the audio source
 * errors, mediabunny drops a track that produced no packets, and the file is silently
 * video-only. Every web capture turns the microphone on, which is why they were the ones
 * arriving without sound.
 *
 * 48 kHz keeps the mux on AAC-LC whatever the hardware is doing.
 */
export const ENCODE_SAMPLE_RATE = 48_000

export type AudioMix = {
  /** The single track to hand the encoder. */
  track: MediaStreamAudioTrack
  /** Held so the caller can close it when the recording ends. */
  context: AudioContext
}

/** Injectable so the rate decision can be tested without WebAudio. */
export type AudioContextFactory = (options: AudioContextOptions) => AudioContext

/**
 * The one track a recording's audio is encoded from, resampled to {@link ENCODE_SAMPLE_RATE}.
 *
 * A single source goes through the graph as well, rather than being passed straight
 * through: the point is not the mixing, it is owning the sample rate — and a lone
 * microphone is exactly the track a headset reports at 16 kHz.
 */
export function mixAudio(
  tracks: MediaStreamAudioTrack[],
  makeContext: AudioContextFactory = (options) => new AudioContext(options)
): AudioMix | null {
  if (tracks.length === 0) return null
  const context = makeContext({ sampleRate: ENCODE_SAMPLE_RATE })
  const destination = context.createMediaStreamDestination()
  for (const track of tracks) {
    context.createMediaStreamSource(new MediaStream([track])).connect(destination)
  }
  const mixed = destination.stream.getAudioTracks()[0]
  return mixed ? { track: mixed, context } : null
}
