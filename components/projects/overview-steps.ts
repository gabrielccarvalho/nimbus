import { languageLabel } from "@/components/settings/settings-fields"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { PipelineStep } from "@/features/pipeline/state-machine"
import { formatBytes, formatDuration, sourceLabel } from "@/lib/format"

type StepId = PipelineStep["id"]

export type OverviewFacts = {
  sourceUrl: string | null
  selectorMode: "anthropic" | "manual" | "heuristic"
  renderQuality: string
  source: {
    bytes: number | null
    durationMs: number | null
    width: number | null
    height: number | null
    fps: number | null
  } | null
  transcript: {
    words: number
    language: string
    languageSource: string | null
  } | null
  silences: number | null
  clipCount: number
  layout: {
    confirmed: boolean
    mode: string
    camPosition: string | null
    hasWebcam: boolean
    width: number | null
    height: number | null
  } | null
}

const STEP_JOBS: Partial<
  Record<StepId, ProjectSnapshot["jobs"][number]["type"]>
> = {
  upload: "download",
  probe: "probe",
  transcribe: "transcribe",
  analyze: "analyze",
  select: "select",
}

const SELECTORS = {
  anthropic: "picked and titled by Claude",
  heuristic: "picked from the audio and transcript",
  manual: "pasted from Claude",
} as const

const LANGUAGE_SOURCES: Record<string, string> = {
  setting: "chosen in settings",
  source: "from the video page",
  detected: "detected",
}

const number = new Intl.NumberFormat("en")

export function stepDetails(
  facts: OverviewFacts
): Record<StepId, string | null> {
  const { source, transcript, layout } = facts
  const resolution =
    source?.width && source.height ? `${source.width}×${source.height}` : null
  return {
    upload: [
      sourceLabel(facts.sourceUrl),
      source?.bytes ? formatBytes(source.bytes) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    probe: source?.durationMs
      ? [
          formatDuration(source.durationMs),
          resolution,
          source.fps ? `${Math.round(source.fps)} fps` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    transcribe: transcript
      ? `${number.format(transcript.words)} words · ${languageLabel(transcript.language)}${
          transcript.languageSource &&
          LANGUAGE_SOURCES[transcript.languageSource]
            ? `, ${LANGUAGE_SOURCES[transcript.languageSource]}`
            : ""
        }`
      : null,
    analyze:
      facts.silences === null
        ? null
        : `${facts.silences} ${facts.silences === 1 ? "silence" : "silences"} · loudness peaks marked`,
    select:
      facts.clipCount > 0
        ? `${facts.clipCount} ${facts.clipCount === 1 ? "clip" : "clips"} ${SELECTORS[facts.selectorMode]}`
        : null,
    layout: layout?.confirmed
      ? [
          layout.hasWebcam
            ? `Webcam ${layout.camPosition === "bottom" ? "below" : "on top"}`
            : "No webcam",
          resolution ? `saved for ${resolution}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    review: "Approve the ones you want rendered",
    render: `Approved clips only · ${facts.renderQuality[0]!.toUpperCase()}${facts.renderQuality.slice(1)} quality`,
  }
}

export function stepTimes(
  jobs: ProjectSnapshot["jobs"]
): Partial<Record<StepId, number>> {
  const times: Partial<Record<StepId, number>> = {}
  for (const [step, type] of Object.entries(STEP_JOBS) as [StepId, string][]) {
    const job = jobs.find(
      (j) =>
        j.type === type &&
        j.status === "succeeded" &&
        j.startedAt &&
        j.finishedAt
    )
    if (job)
      times[step] = Date.parse(job.finishedAt!) - Date.parse(job.startedAt!)
  }
  const renders = jobs.filter(
    (j) =>
      j.type === "render_clip" &&
      j.status === "succeeded" &&
      j.startedAt &&
      j.finishedAt
  )
  if (renders.length) {
    times.render = renders.reduce(
      (sum, j) => sum + Date.parse(j.finishedAt!) - Date.parse(j.startedAt!),
      0
    )
  }
  return times
}

export function webcamCorner(rect: {
  x: number
  y: number
  w: number
  h: number
}) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const vertical = cy < 1 / 3 ? "top" : cy > 2 / 3 ? "bottom" : "middle"
  const horizontal = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "center"
  if (vertical === "middle" && horizontal === "center") return "the middle"
  if (vertical === "middle") return `the ${horizontal} edge`
  if (horizontal === "center") return `the ${vertical} edge`
  return `the ${vertical}-${horizontal} corner`
}
