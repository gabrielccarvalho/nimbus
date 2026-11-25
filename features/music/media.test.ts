import { describe, expect, it } from "vitest"
import {
  peakFold,
  sniffAudio,
  trackInUseMessage,
  trackTitleFromFile,
  waveformPeaks,
} from "./media"

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p
    )
  )

describe("sniffAudio", () => {
  it("sniffs the audio formats we accept", () => {
    expect(sniffAudio(bytes("ID3", [4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("mp3")
    expect(
      sniffAudio(bytes([0xff, 0xfb, 0x90, 0x64], [0, 0, 0, 0, 0, 0, 0, 0]))
    ).toBe("mp3")
    expect(
      sniffAudio(bytes([0xff, 0xf1, 0x50, 0x80], [0, 0, 0, 0, 0, 0, 0, 0]))
    ).toBe("aac")
    expect(sniffAudio(bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe("m4a")
    expect(sniffAudio(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("wav")
    expect(sniffAudio(bytes("OggS", [0, 2, 0, 0, 0, 0, 0, 0]))).toBe("ogg")
    expect(sniffAudio(bytes("fLaC", [0, 0, 0, 0x22, 0, 0, 0, 0]))).toBe("flac")
    expect(sniffAudio(bytes("PK", [3, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe("waveformPeaks", () => {
  it("reduces samples to peaks between 0 and 1", () => {
    expect(waveformPeaks(Int16Array.from([0, 16384, -32768, 0]), 2)).toEqual([
      0.5, 1,
    ])
    expect(waveformPeaks(new Int16Array(0), 240)).toEqual([])
    expect(waveformPeaks(Int16Array.from([100, -200]), 240)).toHaveLength(2)
  })
})

describe("peakFold", () => {
  it("folds PCM chunks split mid-sample into the same peaks", () => {
    const samples = Int16Array.from({ length: 1001 }, (_, i) =>
      Math.round(Math.sin(i / 7) * (i * 30))
    )
    const bytes = new Uint8Array(samples.buffer)
    const whole = peakFold(samples.length, 240)
    whole.push(bytes)
    const split = peakFold(samples.length, 240)
    for (const [from, to] of [
      [0, 1],
      [1, 2],
      [2, 501],
      [501, 501],
      [501, 1338],
      [1338, bytes.length],
    ]) {
      split.push(bytes.subarray(from, to))
    }
    expect(split.peaks()).toEqual(whole.peaks())
    expect(whole.peaks()).toEqual(waveformPeaks(samples, 240))
  })

  it("keeps the bucket count when the decode runs long or short", () => {
    const long = peakFold(4, 2)
    long.push(new Uint8Array(Int16Array.from([0, 0, 0, 0, 16384]).buffer))
    expect(long.peaks()).toEqual([0, 0.5])
    const short = peakFold(4, 2)
    short.push(new Uint8Array(Int16Array.from([16384]).buffer))
    expect(short.peaks()).toEqual([0.5, 0])
  })
})

describe("trackTitleFromFile", () => {
  it("titles a track from its file name", () => {
    expect(trackTitleFromFile("lofi_beat_02.mp3")).toBe("lofi beat 02")
    expect(trackTitleFromFile(".mp3")).toBe("Untitled track")
    expect(trackTitleFromFile(`${"a".repeat(140)}.wav`)).toHaveLength(100)
  })
})

describe("trackInUseMessage", () => {
  it("names the clips that use a track", () => {
    expect(trackInUseMessage([{ title: "Bridge fight" }])).toBe(
      "This track is under “Bridge fight”. Remove it from that clip first."
    )
    expect(trackInUseMessage([{ title: "A" }, { title: "B" }])).toBe(
      "This track is under “A” and “B”. Remove it from those clips first."
    )
    expect(
      trackInUseMessage([
        { title: "A" },
        { title: "B" },
        { title: "C" },
        { title: "D" },
      ])
    ).toBe(
      "This track is under “A”, “B” and 2 more clips. Remove it from those clips first."
    )
  })
})
