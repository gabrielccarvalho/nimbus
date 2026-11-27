import type { TimeRange } from "../analysis/schema"
import type { LayoutPlan, PixelRect } from "../layout/geometry"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "../layout/geometry"
import {
  DUCK_DB,
  DUCK_RAMP_MS,
  type AudioPlan,
  type MusicPlan,
} from "../music/envelope"

export const PRE_ROLL_S = 2

export type Subtitles = { file: string; fontsDir: string }

export function escapeFilterPath(file: string) {
  const level1 = file.replace(/[\\':]/g, "\\$&")
  return level1.replace(/[\\'[\],;]/g, "\\$&")
}

export function outputFps(sourceFps: number | null | undefined) {
  if (!sourceFps || !Number.isFinite(sourceFps)) return 30
  if (sourceFps > 60) return 30
  return Math.round(sourceFps * 1000) / 1000
}

export const seconds = (ms: number) => (Math.round(ms) / 1000).toFixed(3)
const crop = (r: PixelRect) => `crop=${r.w}:${r.h}:${r.x}:${r.y}`

export function subtitleFilter(subtitles?: Subtitles) {
  return subtitles
    ? `,ass=filename=${escapeFilterPath(subtitles.file)}:fontsdir=${escapeFilterPath(subtitles.fontsDir)}`
    : ""
}

export function seekFor(startMs: number) {
  const seekMs = Math.max(0, startMs - PRE_ROLL_S * 1000)
  return { seekMs, offsetMs: startMs - seekMs }
}

// Each part is its own input of the same file, so every one gets an input
// seek and a part hours into the recording costs no more than the first.
export function joinedSource(parts: readonly TimeRange[]) {
  const trims = parts.map((part) => {
    const { offsetMs } = seekFor(part.startMs)
    return `trim=start=${seconds(offsetMs)}:end=${seconds(offsetMs + part.endMs - part.startMs)}`
  })
  const each = (kind: "v" | "a") =>
    trims.map(
      (trim, i) =>
        `[${i}:${kind}]${kind === "a" ? "a" : ""}${trim},${kind === "a" ? "a" : ""}setpts=PTS-STARTPTS[p${kind}${i}]`
    )
  const labels = (kind: "v" | "a") =>
    trims.map((_, i) => `[p${kind}${i}]`).join("")
  return {
    inputs: parts.length,
    lines: [
      ...each("v"),
      `${labels("v")}concat=n=${parts.length}:v=1:a=0[vjoin]`,
      ...each("a"),
      `${labels("a")}concat=n=${parts.length}:v=0:a=1[ajoin]`,
    ],
    video: "[vjoin]setpts=PTS-STARTPTS",
    audio: "[ajoin]asetpts=PTS-STARTPTS",
  }
}

type Joined = ReturnType<typeof joinedSource>

export const isJoined = (
  parts: readonly TimeRange[] | null | undefined
): parts is readonly TimeRange[] => (parts?.length ?? 0) > 1

const STEREO_48K = "aformat=sample_rates=48000:channel_layouts=stereo"
const LIMITER = "alimiter=limit=0.95:level=0:latency=1"

function duckVolume(duck: MusicPlan["duck"]) {
  const ramp = seconds(DUCK_RAMP_MS)
  const terms = duck.map(({ startMs, endMs }) => {
    const rampStartMs = startMs - DUCK_RAMP_MS
    const rise =
      rampStartMs < 0
        ? `t+${seconds(-rampStartMs)}`
        : `t-${seconds(rampStartMs)}`
    return `clip((${rise})/${ramp},0,1)*clip((${seconds(endMs + DUCK_RAMP_MS)}-t)/${ramp},0,1)`
  })
  return `volume='pow(10,${DUCK_DB / 20}*(${terms.join("+")}))':eval=frame`
}

function musicBranch(music: MusicPlan, input: number) {
  const { startMs, musicDb, lengthMs, fadeInMs, fadeOutMs, duck } = music
  return [
    `[${input}:a]atrim=end=${seconds(lengthMs)}`,
    "asetpts=PTS-STARTPTS",
    STEREO_48K,
    `volume=${musicDb}dB`,
    ...(duck.length > 0 ? [duckVolume(duck)] : []),
    ...(fadeInMs > 0 ? [`afade=t=in:st=0:d=${seconds(fadeInMs)}`] : []),
    ...(fadeOutMs > 0
      ? [
          `afade=t=out:st=${seconds(lengthMs - fadeOutMs)}:d=${seconds(fadeOutMs)}`,
        ]
      : []),
    ...(startMs > 0 ? [`adelay=${startMs}:all=1`] : []),
  ].join(",")
}

export function audioGraph({
  from,
  to,
  audio,
  joined,
}: {
  from: string
  to: string
  audio?: AudioPlan | null
  joined?: Joined
}) {
  const sourceDb = audio ? audio.sourceDb : 0
  const music = audio?.music ?? []
  const source = [
    ...(joined
      ? [joined.audio]
      : [`[0:a]atrim=start=${from}:end=${to}`, "asetpts=PTS-STARTPTS"]),
    ...(sourceDb === null
      ? ["volume=0"]
      : sourceDb !== 0
        ? [`volume=${sourceDb}dB`]
        : []),
  ]
  if (music.length === 0) {
    return (
      [...source, ...(sourceDb !== null && sourceDb > 0 ? [LIMITER] : [])].join(
        ","
      ) + "[a]"
    )
  }
  const labels = music.map((_, i) => `[m${i}]`).join("")
  return [
    `${[...source, STEREO_48K].join(",")}[src]`,
    ...music.map(
      (plan, i) => `${musicBranch(plan, i + (joined?.inputs ?? 1))}[m${i}]`
    ),
    `[src]${labels}amix=inputs=${music.length + 1}:duration=first:dropout_transition=0:normalize=0,${LIMITER}[a]`,
  ].join(";\n")
}

export function verticalGraph({
  plan,
  startMs,
  endMs,
  fps,
  subtitles,
  audio,
  parts,
}: {
  plan: LayoutPlan
  startMs: number
  endMs: number
  fps: number
  subtitles?: Subtitles
  audio?: AudioPlan | null
  parts?: readonly TimeRange[] | null
}) {
  const { offsetMs } = seekFor(startMs)
  const from = seconds(offsetMs)
  const to = seconds(offsetMs + endMs - startMs)
  const joined = isJoined(parts) ? joinedSource(parts) : undefined
  const trim =
    joined?.video ?? `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS`
  const tail = `fps=${fps},format=yuv420p${subtitleFilter(subtitles)}[v]`
  const audioLines = [
    ...(joined?.lines ?? []),
    audioGraph({ from, to, audio, joined }),
  ].join(";\n")

  if (plan.mode === "no-cam-blur-fill") {
    return [
      `${trim},split=2[bgsrc][fg]`,
      `[bgsrc]${crop(plan.background)},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},boxblur=20:2,eq=brightness=-0.15,setsar=1[bg]`,
      `[fg]scale=${plan.foreground.w}:${plan.foreground.h},setsar=1[fgs]`,
      `[bg][fgs]overlay=(W-w)/2:(H-h)/2,${tail}`,
      audioLines,
    ].join(";\n")
  }

  if (plan.mode === "no-cam-fill") {
    return [
      `${trim},${crop(plan.crop)},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1,${tail}`,
      audioLines,
    ].join(";\n")
  }

  const [top, bottom] = plan.regions
  return [
    `${trim},split=2[top_src][bottom_src]`,
    `[top_src]${crop(top.crop)},scale=${OUTPUT_WIDTH}:${top.outHeight},setsar=1[top]`,
    `[bottom_src]${crop(bottom.crop)},scale=${OUTPUT_WIDTH}:${bottom.outHeight},setsar=1[bottom]`,
    `[top][bottom]vstack=inputs=2,${tail}`,
    audioLines,
  ].join(";\n")
}

export function editGraph({
  keep,
  subtitles,
}: {
  keep: readonly TimeRange[]
  subtitles?: Subtitles
}) {
  const parts = keep.map((range, i) => {
    const from = seconds(range.startMs)
    const to = seconds(range.endMs)
    return `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${i}]`
  })
  const inputs = keep.map((_, i) => `[v${i}][a${i}]`).join("")
  return [
    ...parts,
    `${inputs}concat=n=${keep.length}:v=1:a=1[vc][a]`,
    `[vc]format=yuv420p${subtitleFilter(subtitles)}[v]`,
  ].join(";\n")
}

export type Encoder =
  "libx264" | "h264_videotoolbox" | "h264_nvenc" | "h264_qsv"

export function videoEncoderArgs(encoder: Encoder, crf = 20): string[] {
  switch (encoder) {
    case "libx264":
      return ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf)]
    case "h264_videotoolbox":
      return [
        "-c:v",
        "h264_videotoolbox",
        "-q:v",
        String(Math.round(65 + ((20 - crf) * 5) / 3)),
        "-allow_sw",
        "1",
      ]
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", String(crf + 3)]
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", String(crf + 3)]
  }
}

export function encoderPreference(
  hardwareEncoding: boolean,
  configured: "auto" | Encoder
): "auto" | Encoder {
  if (!hardwareEncoding) return "libx264"
  return configured === "libx264" ? "auto" : configured
}

export function chooseEncoder(
  preference: "auto" | Encoder,
  available: ReadonlySet<string>
): Encoder {
  if (preference !== "auto") return preference
  for (const encoder of [
    "h264_videotoolbox",
    "h264_nvenc",
    "h264_qsv",
  ] as const) {
    if (available.has(encoder)) return encoder
  }
  return "libx264"
}

export function renderArgs({
  input,
  seekMs,
  music,
  graphFile,
  encoder,
  crf = 20,
  output,
}: {
  input: string
  seekMs: number | readonly number[]
  music?: readonly { file: string; seekMs: number }[]
  graphFile: string
  encoder: Encoder
  crf?: number
  output: string
}) {
  return [
    ...[seekMs]
      .flat()
      .flatMap((ms) => [...(ms > 0 ? ["-ss", seconds(ms)] : []), "-i", input]),
    ...(music ?? []).flatMap((track) => [
      ...(track.seekMs > 0 ? ["-ss", seconds(track.seekMs)] : []),
      "-i",
      track.file,
    ]),
    "-/filter_complex",
    graphFile,
    "-map",
    "[v]",
    "-map",
    "[a]",
    ...videoEncoderArgs(encoder, crf),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    output,
  ]
}
