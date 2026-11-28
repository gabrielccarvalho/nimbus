import { languageLabel } from "@/components/settings/settings-fields"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { PipelineStep } from "@/features/pipeline/state-machine"
import type { SkipReason } from "@/features/transcription/schema"
import { formatBytes, formatDuration } from "@/lib/format"
import { defaultLocale, type Locale } from "@/lib/i18n/config"

import { localSourceLabel, overview } from "./messages/overview"

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
    endMs: number
  } | null
  transcription: { skipped: SkipReason | null; available: boolean }
  silences: number | null
  clipCount: number
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

function transcribeDetail(facts: OverviewFacts, locale: Locale) {
  const t = overview[locale].stepDetails
  const { transcript } = facts
  const { skipped } = facts.transcription
  const words = transcript
    ? new Intl.NumberFormat(locale).format(transcript.words)
    : ""
  if (transcript && skipped)
    return t.partial(
      words,
      formatDuration(transcript.endMs),
      t.skipReasons[skipped]
    )
  if (transcript)
    return t.transcribed(
      words,
      languageLabel(transcript.language, locale),
      transcript.languageSource
        ? t.languageSources[transcript.languageSource]
        : undefined
    )
  if (skipped)
    return t.skipped(skipped === "no_key" ? undefined : t.skipReasons[skipped])
  return null
}

export function stepDetails(
  facts: OverviewFacts,
  locale: Locale = defaultLocale
): Record<StepId, string | null> {
  const t = overview[locale].stepDetails
  const { source } = facts
  const resolution =
    source?.width && source.height ? `${source.width}×${source.height}` : null
  return {
    upload: [
      localSourceLabel(facts.sourceUrl, locale),
      source?.bytes ? formatBytes(source.bytes) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    probe: source?.durationMs
      ? [
          formatDuration(source.durationMs),
          resolution,
          source.fps ? t.fps(Math.round(source.fps)) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    transcribe: transcribeDetail(facts, locale),
    analyze: facts.silences === null ? null : t.silences(facts.silences),
    select:
      facts.clipCount > 0
        ? t.selected[facts.selectorMode](facts.clipCount)
        : null,
    review: t.review,
    render: t.render(
      t.qualities[facts.renderQuality] ??
        `${facts.renderQuality[0]!.toUpperCase()}${facts.renderQuality.slice(1)}`
    ),
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
