import { describe, it, expect } from 'vitest'
import {
  KEEP_EVERYTHING,
  pruneAudio,
  pruneVideo,
  retentionStart,
  trimForSave,
  type AudioSampleRecord,
  type VideoPacketRecord
} from '../retroBuffer'

/** A second of video at 2s keyframes: frames every 0.5s, keyframes at 0, 2, 4… */
const video = (untilSec: number): VideoPacketRecord[] => {
  const out: VideoPacketRecord[] = []
  for (let t = 0; t <= untilSec + 1e-9; t += 0.5) {
    out.push({
      data: new Uint8Array(10),
      isKey: Math.abs(t % 2) < 1e-9,
      timestampSec: Number(t.toFixed(3)),
      durationSec: 0.5
    })
  }
  return out
}

const audio = (untilSec: number): AudioSampleRecord[] => {
  const out: AudioSampleRecord[] = []
  for (let t = 0; t <= untilSec + 1e-9; t += 0.25) {
    out.push({
      data: new Float32Array(4),
      numberOfChannels: 2,
      sampleRate: 48_000,
      timestampSec: Number(t.toFixed(3)),
      durationSec: 0.25
    })
  }
  return out
}

describe('retentionStart', () => {
  it('starts at the last keyframe at or before the window', () => {
    // 10s recorded, want the last 5 → target 5.0, which is itself a keyframe.
    const packets = video(10)
    const i = retentionStart(packets, 5, 10)
    expect(packets[i].isKey).toBe(true)
    expect(packets[i].timestampSec).toBe(4)
  })

  it('never hands back less than the window was asked for', () => {
    // Target 4.6 falls mid-GOP; trimming forward to the keyframe at 6 would return
    // 4 seconds when 5 were requested, so it must go back to 4.
    const packets = video(9.6)
    const i = retentionStart(packets, 5, 9.6)
    expect(packets[i].timestampSec).toBeLessThanOrEqual(9.6 - 5)
    expect(packets[i].isKey).toBe(true)
  })

  it('keeps everything when the recording is shorter than the window', () => {
    expect(retentionStart(video(3), 30, 3)).toBe(0)
  })

  it('keeps everything when no window is set', () => {
    expect(retentionStart(video(100), KEEP_EVERYTHING, 100)).toBe(0)
  })

  it('always lands on a keyframe, whatever the window', () => {
    const packets = video(20)
    for (let w = 1; w <= 20; w += 0.5) {
      expect(packets[retentionStart(packets, w, 20)].isKey).toBe(true)
    }
  })
})

describe('pruneVideo', () => {
  it('bounds the buffer as the recording runs on', () => {
    const packets = video(60)
    const kept = pruneVideo(packets, 10, 60)
    expect(kept.length).toBeLessThan(packets.length)
    expect(kept[0].isKey).toBe(true)
    expect(60 - kept[0].timestampSec).toBeGreaterThanOrEqual(10)
  })

  it('does not mutate the list it was given', () => {
    const packets = video(60)
    const before = packets.length
    pruneVideo(packets, 10, 60)
    expect(packets).toHaveLength(before)
  })
})

describe('pruneAudio', () => {
  it('keeps a sample that straddles the cut rather than leaving a gap', () => {
    const samples: AudioSampleRecord[] = [
      {
        data: new Float32Array(4),
        numberOfChannels: 2,
        sampleRate: 48_000,
        timestampSec: 3.9,
        durationSec: 0.25
      }
    ]
    expect(pruneAudio(samples, 4)).toHaveLength(1)
  })

  it('drops audio that ends before the video starts', () => {
    expect(pruneAudio(audio(10), 5).every((s) => s.timestampSec + s.durationSec > 5)).toBe(true)
  })
})

describe('trimForSave', () => {
  it('rebases the file to start at zero', () => {
    const out = trimForSave(video(30), audio(30), 10, 30)
    expect(out.startSec).toBeGreaterThan(0)
    expect(out.video[0].timestampSec).toBe(0)
    expect(out.audio[0].timestampSec).toBe(0)
  })

  it('preserves the spacing between frames while rebasing', () => {
    const out = trimForSave(video(30), audio(30), 10, 30)
    expect(out.video[1].timestampSec - out.video[0].timestampSec).toBeCloseTo(0.5, 6)
  })

  it('never starts audio after the video, which would drift the two apart', () => {
    for (let w = 1; w <= 20; w += 1) {
      const out = trimForSave(video(30), audio(30), w, 30)
      expect(out.audio[0].timestampSec).toBeLessThanOrEqual(out.video[0].timestampSec)
    }
  })

  it('passes a short recording through untouched', () => {
    const out = trimForSave(video(3), audio(3), 30, 3)
    expect(out.startSec).toBe(0)
    expect(out.video).toHaveLength(video(3).length)
  })

  it('survives a buffer with no video at all', () => {
    const out = trimForSave([], [], 10, 10)
    expect(out).toEqual({ video: [], audio: [], startSec: 0 })
  })
})
