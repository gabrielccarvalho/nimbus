import { describe, expect, it } from "vitest"

import { clipEffectsSchema } from "../effects/schema"
import { planLayout } from "../layout/geometry"
import { FULL_FRAME } from "../layout/schema"
import { hasRoomFor } from "@/lib/storage/disk"

import { estimateRenderBytes } from "./disk"
import { editedDuration, keepRanges, remapToEdit } from "./edit"
import { effectCommands, effectsGraph } from "./effects-graph"
import {
  audioGraph,
  chooseEncoder,
  encoderPreference,
  videoEncoderArgs,
  editGraph,
  escapeFilterPath,
  outputFps,
  renderArgs,
  seekFor,
  verticalGraph,
} from "./filtergraph"

const subtitles = { file: "/data/work/c1.ass", fontsDir: "/app/assets/fonts" }
const webcamRect = { x: 0.7833, y: 0.7704, w: 0.2, h: 0.2 }
const music = {
  musicDb: -16,
  lengthMs: 15_000,
  fadeInMs: 500,
  fadeOutMs: 1_500,
  duck: [
    { startMs: 1_000, endMs: 2_500 },
    { startMs: 6_000, endMs: 9_000 },
  ],
}
const limiter = "alimiter=limit=0.95:level=0:latency=1"

describe("audioGraph", () => {
  it("mixes ducked, faded music under the source without normalising", () =>
    expect(
      audioGraph({
        from: "2.000",
        to: "17.000",
        audio: { sourceDb: -3, music },
      })
    ).toBe(
      [
        "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,volume=-3dB,aformat=sample_rates=48000:channel_layouts=stereo[src]",
        "[1:a]atrim=end=15.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=-16dB,volume='pow(10,-0.5*(clip((t-0.800)/0.200,0,1)*clip((2.700-t)/0.200,0,1)+clip((t-5.800)/0.200,0,1)*clip((9.200-t)/0.200,0,1)))':eval=frame,afade=t=in:st=0:d=0.500,afade=t=out:st=13.500:d=1.500[music]",
        "[src][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[a]",
      ].join(";\n")
    ))

  it("keeps today's audio line without a plan or at 0 dB", () => {
    const today = "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS[a]"
    expect(audioGraph({ from: "2.000", to: "17.000" })).toBe(today)
    expect(audioGraph({ from: "2.000", to: "17.000", audio: null })).toBe(today)
    expect(
      audioGraph({
        from: "2.000",
        to: "17.000",
        audio: { sourceDb: 0, music: null },
      })
    ).toBe(today)
  })

  it("ramps into speech that starts the clip", () =>
    expect(
      audioGraph({
        from: "0.000",
        to: "15.000",
        audio: {
          sourceDb: 0,
          music: { ...music, duck: [{ startMs: 0, endMs: 1_000 }] },
        },
      })
    ).toContain(
      "volume='pow(10,-0.5*(clip((t+0.200)/0.200,0,1)*clip((1.200-t)/0.200,0,1)))':eval=frame"
    ))

  it("drops the duck and fade-in without speech or a fade", () => {
    const graph = audioGraph({
      from: "2.000",
      to: "17.000",
      audio: { sourceDb: 0, music: { ...music, duck: [], fadeInMs: 0 } },
    })
    expect(graph).not.toContain("eval=frame")
    expect(graph).not.toContain("afade=t=in")
    expect(graph).toContain(
      "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[src]"
    )
    expect(graph).toContain("volume=-16dB,afade=t=out:st=13.500:d=1.500[music]")
  })

  it("limits only a boosted source", () => {
    const source = (sourceDb: number) =>
      audioGraph({
        from: "2.000",
        to: "17.000",
        audio: { sourceDb, music: null },
      })
    expect(source(-3)).toBe(
      "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,volume=-3dB[a]"
    )
    expect(source(6)).toBe(
      `[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,volume=6dB,${limiter}[a]`
    )
  })

  it("pins the mixes", async () => {
    const from = "2.000"
    const to = "17.000"
    await expect(
      audioGraph({ from, to, audio: { sourceDb: -3, music } })
    ).toMatchFileSnapshot("./__golden__/audio-duck.txt")
    await expect(
      audioGraph({
        from,
        to,
        audio: {
          sourceDb: 0,
          music: {
            ...music,
            lengthMs: 8_000,
            duck: [
              { startMs: 1_000, endMs: 2_500 },
              { startMs: 6_000, endMs: 8_000 },
            ],
          },
        },
      })
    ).toMatchFileSnapshot("./__golden__/audio-ends-early.txt")
    await expect(
      audioGraph({ from, to, audio: { sourceDb: 6, music: null } })
    ).toMatchFileSnapshot("./__golden__/audio-source-only.txt")
  })
})

describe("verticalGraph", () => {
  it("builds cam-top with captions", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "cam-top",
        },
        1920,
        1080
      ),
      startMs: 12_000,
      endMs: 41_500,
      fps: 30,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/cam-top.txt")
  })

  it("builds cam-top with music", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "cam-top",
        },
        1920,
        1080
      ),
      startMs: 12_000,
      endMs: 41_500,
      fps: 30,
      subtitles,
      audio: { sourceDb: 0, music },
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/cam-top-music.txt")
  })

  it("builds split-50 near the start without pre-roll", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.2,
          mode: "split-50",
        },
        2560,
        1080
      ),
      startMs: 500,
      endMs: 16_000,
      fps: 60,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/split-50.txt")
  })

  it("builds no-cam-fill from a 4:3 source", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect: null,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.3,
          mode: "no-cam-fill",
        },
        1440,
        1080
      ),
      startMs: 8000,
      endMs: 38_000,
      fps: 30,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/fill.txt")
  })

  it("builds no-cam-blur-fill", async () => {
    const graph = verticalGraph({
      plan: planLayout(
        {
          webcamRect: null,
          gameplayRect: FULL_FRAME,
          gameplayFocusX: 0.5,
          mode: "no-cam-blur-fill",
        },
        1920,
        1080
      ),
      startMs: 30_000,
      endMs: 45_000,
      fps: 29.97,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/blur-fill.txt")
  })
})

describe("effectsGraph", () => {
  const camTop = {
    webcamRect,
    gameplayRect: FULL_FRAME,
    gameplayFocusX: 0.5,
    mode: "cam-top" as const,
  }
  const source = { width: 1920, height: 1080 }

  const zoomShakeFocus = {
    layout: camTop,
    source,
    events: [
      {
        kind: "zoom",
        startMs: 14_000,
        endMs: 17_000,
        scale: 1.4,
        focus: { x: 0.5, y: 0.5 },
      },
      { kind: "shake", startMs: 16_000, endMs: 16_600, intensity: "strong" },
      { kind: "focus", startMs: 21_000, endMs: 24_500, target: "cam" },
    ],
    startMs: 12_000,
    endMs: 41_500,
    fps: 30,
    commandsFile: "/data/work/c1.cmds.txt",
    subtitles,
  } as const

  it("builds zoom+shake+focus on cam-top", async () => {
    const graph = effectsGraph(zoomShakeFocus)
    await expect(graph).toMatchFileSnapshot("./__golden__/effects-cam-top.txt")
  })

  it("builds zoom+shake+focus on cam-top with music", async () => {
    const graph = effectsGraph({
      ...zoomShakeFocus,
      audio: { sourceDb: 0, music },
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/effects-music.txt")
  })

  it("builds full game with a zoom on cam-top", async () => {
    const graph = effectsGraph({
      layout: { ...camTop, gameplayFocusX: 0.3 },
      source,
      events: [
        { kind: "focus", startMs: 13_000, endMs: 16_000, target: "game" },
        {
          kind: "zoom",
          startMs: 14_000,
          endMs: 15_000,
          scale: 1.5,
          focus: { x: 0.4, y: 0.5 },
        },
        { kind: "focus", startMs: 18_000, endMs: 19_000, target: "cam" },
      ],
      startMs: 12_000,
      endMs: 20_000,
      fps: 30,
      commandsFile: "/data/work/c1.cmds.txt",
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot(
      "./__golden__/effects-full-game.txt"
    )
  })

  const zoomAndShake = [
    {
      kind: "zoom",
      startMs: 33_000,
      endMs: 37_000,
      scale: 1.6,
      focus: { x: 0.3, y: 0.6 },
    },
    { kind: "shake", startMs: 36_000, endMs: 36_700, intensity: "light" },
  ] as const

  it("builds zoom+shake on no-cam-blur-fill", async () => {
    const graph = effectsGraph({
      layout: {
        webcamRect: null,
        gameplayRect: FULL_FRAME,
        gameplayFocusX: 0.5,
        mode: "no-cam-blur-fill",
      },
      source,
      events: zoomAndShake,
      startMs: 30_000,
      endMs: 45_000,
      fps: 29.97,
      commandsFile: "/data/work/c1.cmds.txt",
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot(
      "./__golden__/effects-blur-fill.txt"
    )
  })

  it("builds zoom+shake on no-cam-fill from a 4:3 source", async () => {
    const graph = effectsGraph({
      layout: {
        webcamRect: null,
        gameplayRect: FULL_FRAME,
        gameplayFocusX: 0.3,
        mode: "no-cam-fill",
      },
      source: { width: 1440, height: 1080 },
      events: zoomAndShake,
      startMs: 30_000,
      endMs: 45_000,
      fps: 30,
      commandsFile: "/data/work/c1.cmds.txt",
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/effects-fill.txt")
  })

  it("overlays full cam for a stored focus without a target", () => {
    const { events } = clipEffectsSchema.parse({
      edited: true,
      events: [{ kind: "focus", startMs: 13_000, endMs: 15_000 }],
    })
    const graph = effectsGraph({
      layout: camTop,
      source,
      events,
      startMs: 12_000,
      endMs: 20_000,
      fps: 30,
    })
    expect(graph).toContain(
      "[stack][r2]overlay=0:0:enable='between(t,0.983,2.983)',"
    )
  })

  it("leaves sendcmd out without a commands file", () => {
    const graph = effectsGraph({
      layout: camTop,
      source,
      events: [
        { kind: "focus", startMs: 13_000, endMs: 15_000, target: "cam" },
      ],
      startMs: 12_000,
      endMs: 20_000,
      fps: 30,
    })
    expect(graph).not.toContain("sendcmd")
    expect(graph).toContain("enable='between(t,0.983,2.983)'")
  })

  it("leaves clips without effects on the unchanged verticalGraph", async () => {
    const graph = verticalGraph({
      plan: planLayout(camTop, 1920, 1080),
      startMs: 12_000,
      endMs: 41_500,
      fps: 30,
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/cam-top.txt")
  })
})

describe("effectCommands", () => {
  const layout = {
    webcamRect,
    gameplayRect: FULL_FRAME,
    gameplayFocusX: 0.5,
    mode: "cam-top" as const,
  }
  const base = {
    layout,
    source: { width: 1920, height: 1080 },
    startMs: 10_000,
    endMs: 14_000,
    fps: 30,
  }
  const times = (commands: string) =>
    commands
      .trim()
      .split("\n")
      .map((line) => Number(line.split(" ")[0]))

  it("emits nothing when idle", () => {
    expect(effectCommands({ ...base, events: [] })).toBe("")
    expect(
      effectCommands({
        ...base,
        layout: { ...layout, webcamRect: null, mode: "no-cam-blur-fill" },
        events: [
          { kind: "focus", startMs: 11_000, endMs: 12_000, target: "cam" },
        ],
      })
    ).toBe("")
  })

  it("emits one entry per output frame where the crop changes", () => {
    const commands = effectCommands({
      ...base,
      events: [
        {
          kind: "zoom",
          startMs: 11_000,
          endMs: 13_000,
          scale: 1.4,
          focus: { x: 0.5, y: 0.5 },
        },
      ],
    })
    const at = times(commands)
    expect(new Set(at).size).toBe(at.length)
    expect(at.every((t) => t > 0.99 && t < 3.01)).toBe(true)
    expect(at.filter((t) => t > 1.2 && t < 2.8)).toEqual([])
    expect(at.length).toBeGreaterThanOrEqual(8)
    expect(at.length).toBeLessThanOrEqual(12)
    expect(commands.split("\n")[0]).toMatch(
      /^\d\.\d{4} scale@e1 w \d+, scale@e1 h \d+, crop@e1 x \d+, crop@e1 y \d+;$/
    )
  })

  it("drives the full game slot through a zoom", () => {
    const commands = effectCommands({
      ...base,
      events: [
        { kind: "focus", startMs: 10_500, endMs: 13_500, target: "game" },
        {
          kind: "zoom",
          startMs: 11_000,
          endMs: 13_000,
          scale: 1.4,
          focus: { x: 0.5, y: 0.5 },
        },
      ],
    })
    expect(commands).toContain("scale@e2 w")
    expect(commands).not.toContain("@e3")
  })

  it("moves every frame while shaking and drives the focus slot", () => {
    const commands = effectCommands({
      ...base,
      events: [
        { kind: "focus", startMs: 11_000, endMs: 12_000, target: "cam" },
        { kind: "shake", startMs: 11_000, endMs: 11_500, intensity: "light" },
      ],
    })
    const at = times(commands)
    expect(at.length).toBe(16)
    expect(commands).toContain("crop@e2 x")
  })
})

describe("editGraph", () => {
  it("concatenates keep ranges", async () => {
    const graph = editGraph({
      keep: [
        { startMs: 0, endMs: 4150 },
        { startMs: 5850, endMs: 20_000 },
      ],
      subtitles,
    })
    await expect(graph).toMatchFileSnapshot("./__golden__/edit.txt")
  })
})

describe("helpers", () => {
  it("escapes paths for both filtergraph levels", () => {
    expect(escapeFilterPath("/tmp/a b/c.ass")).toBe("/tmp/a b/c.ass")
    expect(escapeFilterPath("C:\\x")).toBe("C\\\\:\\\\\\\\x")
    expect(escapeFilterPath("/it's,[x];y")).toBe("/it\\\\\\'s\\,\\[x\\]\\;y")
  })

  it("picks the output frame rate", () => {
    expect(outputFps(60)).toBe(60)
    expect(outputFps(144)).toBe(30)
    expect(outputFps(23.976)).toBe(23.976)
    expect(outputFps(null)).toBe(30)
  })

  it("seeks two seconds before the clip", () => {
    expect(seekFor(12_000)).toEqual({ seekMs: 10_000, offsetMs: 2000 })
    expect(seekFor(500)).toEqual({ seekMs: 0, offsetMs: 500 })
  })

  it("chooses an encoder", () => {
    const available = new Set(["libx264", "h264_videotoolbox"])
    expect(chooseEncoder("libx264", available)).toBe("libx264")
    expect(chooseEncoder("auto", available)).toBe("h264_videotoolbox")
    expect(chooseEncoder("auto", new Set(["libx264"]))).toBe("libx264")
    expect(encoderPreference(false, "h264_nvenc")).toBe("libx264")
    expect(encoderPreference(true, "libx264")).toBe("auto")
    expect(encoderPreference(true, "h264_nvenc")).toBe("h264_nvenc")
    expect(videoEncoderArgs("libx264", 26)).toContain("26")
    expect(videoEncoderArgs("h264_videotoolbox", 17)).toContain("70")
    expect(videoEncoderArgs("h264_videotoolbox", 26)).toContain("55")
  })

  it("builds the ffmpeg arguments", () => {
    expect(
      renderArgs({
        input: "/in.mp4",
        seekMs: 10_000,
        graphFile: "/g.txt",
        encoder: "libx264",
        output: "/out.mp4",
      })
    ).toEqual([
      "-ss",
      "10.000",
      "-i",
      "/in.mp4",
      "-/filter_complex",
      "/g.txt",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      "/out.mp4",
    ])
  })

  it("adds the music track as the second input", () => {
    const args = (seekMs: number) =>
      renderArgs({
        input: "/in.mp4",
        seekMs: 10_000,
        music: { file: "/data/music/w/t.m4a", seekMs },
        graphFile: "/g.txt",
        encoder: "libx264",
        output: "/out.mp4",
      })
    expect(args(45_000).slice(0, 10)).toEqual([
      "-ss",
      "10.000",
      "-i",
      "/in.mp4",
      "-ss",
      "45.000",
      "-i",
      "/data/music/w/t.m4a",
      "-/filter_complex",
      "/g.txt",
    ])
    expect(args(0).slice(0, 8)).toEqual([
      "-ss",
      "10.000",
      "-i",
      "/in.mp4",
      "-i",
      "/data/music/w/t.m4a",
      "-/filter_complex",
      "/g.txt",
    ])
  })

  it("checks disk headroom", () => {
    const estimate = estimateRenderBytes(60_000)
    expect(estimate).toBe(61_200_000)
    expect(hasRoomFor(2 * estimate + 500 * 1024 ** 2, estimate)).toBe(true)
    expect(hasRoomFor(2 * estimate, estimate)).toBe(false)
  })
})

describe("keepRanges", () => {
  it("cuts long silences with padding and keeps short ones", () => {
    const keep = keepRanges(
      [
        { startMs: 4000, endMs: 6000 },
        { startMs: 9000, endMs: 9800 },
        { startMs: 19_000, endMs: 20_000 },
      ],
      20_000
    )
    expect(keep).toEqual([
      { startMs: 0, endMs: 4150 },
      { startMs: 5850, endMs: 20_000 },
    ])
    expect(editedDuration(keep)).toBe(18_300)
  })

  it("merges overlapping cuts and handles edges", () => {
    expect(
      keepRanges(
        [
          { startMs: 0, endMs: 3000 },
          { startMs: 2500, endMs: 5000 },
          { startMs: 8000, endMs: 10_000 },
        ],
        10_000
      )
    ).toEqual([
      { startMs: 0, endMs: 150 },
      { startMs: 4850, endMs: 8150 },
      { startMs: 9850, endMs: 10_000 },
    ])
    expect(keepRanges([], 5000)).toEqual([{ startMs: 0, endMs: 5000 }])
  })

  it("moves words onto the cut timeline and drops cut ones", () => {
    const keep = [
      { startMs: 0, endMs: 4150 },
      { startMs: 5850, endMs: 20_000 },
    ]
    expect(
      remapToEdit(
        [
          { text: "a", startMs: 3000, endMs: 3500 },
          { text: "b", startMs: 4000, endMs: 4400 },
          { text: "gone", startMs: 5000, endMs: 5400 },
          { text: "c", startMs: 6000, endMs: 6500 },
        ],
        keep
      )
    ).toEqual([
      { text: "a", startMs: 3000, endMs: 3500 },
      { text: "b", startMs: 4000, endMs: 4150 },
      { text: "c", startMs: 4300, endMs: 4800 },
    ])
  })
})
