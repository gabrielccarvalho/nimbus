import type { TimeRange } from "../analysis/schema"
import type { LayoutPlan, PixelRect } from "../layout/geometry"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "../layout/geometry"

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

const seconds = (ms: number) => (Math.round(ms) / 1000).toFixed(3)
const crop = (r: PixelRect) => `crop=${r.w}:${r.h}:${r.x}:${r.y}`

function subtitleFilter(subtitles?: Subtitles) {
  return subtitles
    ? `,ass=filename=${escapeFilterPath(subtitles.file)}:fontsdir=${escapeFilterPath(subtitles.fontsDir)}`
    : ""
}

export function seekFor(startMs: number) {
  const seekMs = Math.max(0, startMs - PRE_ROLL_S * 1000)
  return { seekMs, offsetMs: startMs - seekMs }
}

export function verticalGraph({
  plan,
  startMs,
  endMs,
  fps,
  subtitles,
}: {
  plan: LayoutPlan
  startMs: number
  endMs: number
  fps: number
  subtitles?: Subtitles
}) {
  const { offsetMs } = seekFor(startMs)
  const from = seconds(offsetMs)
  const to = seconds(offsetMs + endMs - startMs)
  const trim = `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS`
  const tail = `fps=${fps},format=yuv420p${subtitleFilter(subtitles)}[v]`
  const audio = `[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a]`

  if (plan.mode === "no-cam-blur-fill") {
    return [
      `${trim},split=2[bgsrc][fg]`,
      `[bgsrc]${crop(plan.background)},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},boxblur=20:2,eq=brightness=-0.15,setsar=1[bg]`,
      `[fg]scale=${OUTPUT_WIDTH}:${plan.foregroundHeight},setsar=1[fgs]`,
      `[bg][fgs]overlay=(W-w)/2:(H-h)/2,${tail}`,
      audio,
    ].join(";\n")
  }

  const [top, bottom] = plan.regions
  return [
    `${trim},split=2[top_src][bottom_src]`,
    `[top_src]${crop(top.crop)},scale=${OUTPUT_WIDTH}:${top.outHeight},setsar=1[top]`,
    `[bottom_src]${crop(bottom.crop)},scale=${OUTPUT_WIDTH}:${bottom.outHeight},setsar=1[bottom]`,
    `[top][bottom]vstack=inputs=2,${tail}`,
    audio,
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
  graphFile,
  encoder,
  crf = 20,
  output,
}: {
  input: string
  seekMs: number
  graphFile: string
  encoder: Encoder
  crf?: number
  output: string
}) {
  return [
    ...(seekMs > 0 ? ["-ss", seconds(seekMs)] : []),
    "-i",
    input,
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
