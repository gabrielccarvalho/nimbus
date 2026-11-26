import { describe, expect, it } from "vitest"

import {
  classifyAspect,
  isLandscape,
  parseAudioProbe,
  parseProbe,
  parseRate,
} from "./probe-parse"

const probe = (overrides: {
  video?: Record<string, unknown>
  audio?: Record<string, unknown> | null
  duration?: string
}) =>
  JSON.stringify({
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        avg_frame_rate: "30000/1001",
        sample_aspect_ratio: "1:1",
        ...overrides.video,
      },
      ...(overrides.audio === null
        ? []
        : [{ codec_type: "audio", codec_name: "aac", ...overrides.audio }]),
    ],
    format: { duration: overrides.duration ?? "20.5", format_name: "mov,mp4" },
  })

describe("parseProbe", () => {
  it("reads duration, size, fps and codecs", () => {
    expect(parseProbe(probe({}))).toEqual({
      durationMs: 20_500,
      width: 1920,
      height: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
      fps: 29.97,
      codec: "h264",
      audioCodec: "aac",
      audioTracks: [
        { index: 0, codec: "aac", channels: 0, language: null, title: null },
      ],
      formatName: "mov,mp4",
    })
  })

  it("lists every audio track with its language and name", () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
        {
          codec_type: "audio",
          codec_name: "aac",
          channels: 2,
          tags: { language: "eng", handler_name: "Game" },
        },
        {
          codec_type: "audio",
          codec_name: "opus",
          channels: 1,
          tags: { language: "por", title: "Mic" },
        },
      ],
      format: { duration: "10" },
    })
    expect(parseProbe(json).audioTracks).toEqual([
      { index: 0, codec: "aac", channels: 2, language: "eng", title: "Game" },
      { index: 1, codec: "opus", channels: 1, language: "por", title: "Mic" },
    ])
  })

  it("swaps display dimensions for rotated video", () => {
    const viaSideData = parseProbe(
      probe({ video: { side_data_list: [{ rotation: -90 }] } })
    )
    expect([viaSideData.displayWidth, viaSideData.displayHeight]).toEqual([
      1080, 1920,
    ])
    const viaTag = parseProbe(probe({ video: { tags: { rotate: "270" } } }))
    expect(viaTag.displayWidth).toBe(1080)
  })

  it("applies sample aspect ratio", () => {
    const anamorphic = parseProbe(
      probe({ video: { width: 1440, sample_aspect_ratio: "4:3" } })
    )
    expect(anamorphic.displayWidth).toBe(1920)
  })

  it("falls back to r_frame_rate and stream duration", () => {
    const result = parseProbe(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            width: 640,
            height: 360,
            avg_frame_rate: "0/0",
            r_frame_rate: "25/1",
            duration: "3.0",
          },
          { codec_type: "audio" },
        ],
      })
    )
    expect(result).toMatchObject({
      fps: 25,
      durationMs: 3000,
      codec: "unknown",
    })
  })

  it.each([
    ["not json", /media info/],
    [JSON.stringify({ streams: "nope" }), /media info/],
    [probe({ audio: null }), /no audio/],
    [probe({ video: { codec_type: "data" } }), /no video/],
    [probe({ video: { disposition: { attached_pic: 1 } } }), /no video/],
    [probe({ duration: "0" }), /duration/],
  ])("rejects %#", (input, message) => {
    expect(() => parseProbe(input)).toThrow(message)
  })
})

describe("parseRate", () => {
  it.each([
    ["30/1", 30],
    ["0/0", 0],
    ["24", 24],
    [undefined, 0],
    ["abc", 0],
  ])("%s → %d", (rate, expected) => {
    expect(parseRate(rate)).toBe(expected)
  })
})

describe("classifyAspect", () => {
  it.each([
    [1920, 1080, "16:9"],
    [1280, 720, "16:9"],
    [1366, 768, "16:9"],
    [2560, 1080, "21:9"],
    [3440, 1440, "21:9"],
    [3840, 1600, "21:9"],
    [1920, 800, "21:9"],
    [1440, 1080, "4:3"],
    [1024, 768, "4:3"],
    [640, 480, "4:3"],
    [1920, 1200, "16:10"],
    [1680, 1050, "16:10"],
    [1080, 1920, "other"],
    [3840, 1080, "other"],
    [0, 1080, "other"],
  ])("%ix%i → %s", (w, h, expected) => {
    expect(classifyAspect(w, h)).toBe(expected)
  })

  it("treats anything clearly wider than tall as landscape", () => {
    expect(isLandscape(1440, 1080)).toBe(true)
    expect(isLandscape(3840, 1080)).toBe(true)
    expect(isLandscape(1080, 1080)).toBe(false)
    expect(isLandscape(1080, 1920)).toBe(false)
  })
})

describe("parseAudioProbe", () => {
  it("reads the duration and codec of an audio file", () =>
    expect(
      parseAudioProbe(
        JSON.stringify({
          streams: [{ codec_type: "audio", codec_name: "aac" }],
          format: { duration: "30.02" },
        })
      )
    ).toEqual({ durationMs: 30_020, codec: "aac" }))

  it("rejects a file without audio", () =>
    expect(() => parseAudioProbe(probe({ audio: null }))).toThrow(
      "This file has no audio"
    ))
})
