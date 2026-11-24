import {
  activeEffect,
  frameAt,
  type FloatRect,
  type FrameRegion,
} from "../effects/frame"
import type { Effect } from "../effects/schema"
import { usesWebcam, type LayoutInput } from "../layout/schema"
import {
  escapeFilterPath,
  seconds,
  seekFor,
  subtitleFilter,
  type Subtitles,
} from "./filtergraph"

type EffectsInput = {
  layout: LayoutInput
  source: { width: number; height: number }
  events: readonly Effect[]
  startMs: number
  endMs: number
  fps: number
}

type Placement = { w: number; h: number; x: number; y: number }

const FIELDS = [
  ["scale", "w"],
  ["scale", "h"],
  ["crop", "x"],
  ["crop", "y"],
] as const

function hasFocusSlot({ layout, events }: EffectsInput) {
  return (
    usesWebcam(layout.mode) &&
    !!layout.webcamRect &&
    events.some((event) => event.kind === "focus")
  )
}

function slotsAt(
  input: EffectsInput,
  tMs: number,
  events = input.events
): FrameRegion[] {
  const { layout, source } = input
  const regions = frameAt(
    layout,
    source,
    events.filter((event) => event.kind !== "focus"),
    tMs
  ).regions
  if (!hasFocusSlot(input)) return regions
  const focus: Effect = { kind: "focus", startMs: tMs, endMs: tMs + 1 }
  const shakes = events.filter((event) => event.kind === "shake")
  return [
    ...regions,
    ...frameAt(layout, source, [focus, ...shakes], tMs).regions,
  ]
}

function frameOffsets({ startMs, endMs, fps }: EffectsInput) {
  const count = Math.ceil(((endMs - startMs) * fps) / 1000)
  return Array.from({ length: count }, (_, k) => (k * 1000) / fps)
}

function placement(base: FrameRegion, crop: FloatRect): Placement {
  const { dest } = base
  const sx = dest.w / crop.w
  const sy = dest.h / crop.h
  const w = Math.max(dest.w, Math.round(base.crop.w * sx))
  const h = Math.max(dest.h, Math.round(base.crop.h * sy))
  return {
    w,
    h,
    x: Math.min(w - dest.w, Math.round((crop.x - base.crop.x) * sx)),
    y: Math.min(h - dest.h, Math.round((crop.y - base.crop.y) * sy)),
  }
}

// Half a millisecond early so float rounding can't apply a command a frame late.
const commandTime = (offsetMs: number) =>
  (Math.max(0, offsetMs - 0.5) / 1000).toFixed(4)

export function effectCommands(input: EffectsInput): string {
  const bases = slotsAt(input, input.startMs, [])
  let previous = bases.map((base) => placement(base, base.crop))
  const entries: string[] = []
  for (const offsetMs of frameOffsets(input)) {
    const current = slotsAt(input, input.startMs + offsetMs).map((region, i) =>
      placement(bases[i]!, region.crop)
    )
    const commands = current.flatMap((now, i) =>
      FIELDS.filter(([, field]) => now[field] !== previous[i]![field]).map(
        ([filter, field]) => `${filter}@e${i} ${field} ${now[field]}`
      )
    )
    if (commands.length > 0) {
      entries.push(`${commandTime(offsetMs)} ${commands.join(", ")};\n`)
    }
    previous = current
  }
  return entries.join("")
}

function focusEnable(input: EffectsInput) {
  const { events, startMs, fps } = input
  const edge = (k: number) => seconds(Math.max(0, ((k - 0.5) * 1000) / fps))
  const on = frameOffsets(input).map(
    (offsetMs) => !!activeEffect(events, "focus", startMs + offsetMs)
  )
  const ranges: string[] = []
  let from = 0
  on.forEach((active, k) => {
    if (active && !on[k - 1]) from = k
    if (active && !on[k + 1]) {
      ranges.push(`between(t,${edge(from)},${edge(k + 1)})`)
    }
  })
  return ranges.join("+") || "0"
}

const cropRect = (r: FloatRect) => `crop=${r.w}:${r.h}:${r.x}:${r.y}`

function branch(region: FrameRegion, i: number) {
  const { w, h } = region.dest
  const blur = region.blur ? ",boxblur=20:2,eq=brightness=-0.15" : ""
  return `[s${i}]${cropRect(region.crop)},scale@e${i}=${w}:${h},crop@e${i}=${w}:${h}:0:0:exact=1${blur},setsar=1[r${i}]`
}

function composite(regions: readonly FrameRegion[]) {
  if (regions.length === 1) return "[r0]null"
  const [back, front] = regions
  return back!.blur
    ? `[r0][r1]overlay=${front!.dest.x}:${front!.dest.y}`
    : "[r0][r1]vstack=inputs=2"
}

export function effectsGraph({
  commandsFile,
  subtitles,
  ...input
}: EffectsInput & { commandsFile?: string; subtitles?: Subtitles }) {
  const { startMs, endMs, fps } = input
  const { offsetMs } = seekFor(startMs)
  const from = seconds(offsetMs)
  const to = seconds(offsetMs + endMs - startMs)
  const slots = slotsAt(input, startMs, [])
  const focus = hasFocusSlot(input)
  const stacked = focus ? slots.slice(0, -1) : slots
  const tail = `format=yuv420p${subtitleFilter(subtitles)}[v]`
  const splits = slots.map((_, i) => `[s${i}]`).join("")
  const sendcmd = commandsFile
    ? `sendcmd=f=${escapeFilterPath(commandsFile)},`
    : ""

  return [
    `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS,fps=${fps},${sendcmd}split=${slots.length}${splits}`,
    ...slots.map(branch),
    ...(focus
      ? [
          `${composite(stacked)}[stack]`,
          `[stack][r${stacked.length}]overlay=0:0:enable='${focusEnable(input)}',${tail}`,
        ]
      : [`${composite(stacked)},${tail}`]),
    `[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a]`,
  ].join(";\n")
}
