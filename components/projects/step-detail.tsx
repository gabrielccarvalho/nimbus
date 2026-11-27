"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Timeline,
  TimelineLoudness,
  TimelineRange,
} from "@/components/ui/timeline"
import { normalizeLoudness } from "@/features/analysis/loudness"
import type { StepDetail } from "@/features/pipeline/detail"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import { languageLabel } from "@/components/settings/settings-fields"
import { formatBytes, formatDuration } from "@/lib/format"

export type RenderClip = {
  id: string
  title: string
  startMs: number
  endMs: number
}

type Job = ProjectSnapshot["jobs"][number]
type Detail<K extends StepDetail["kind"]> = Extract<StepDetail, { kind: K }>

const LANGUAGE_SOURCE: Record<string, string> = {
  setting: "chosen in settings",
  source: "from the video page",
  detected: "detected",
  whisper: "detected by whisper",
}

export function StepDetailView({
  snapshot,
  clips,
  videoSrc,
}: {
  snapshot: ProjectSnapshot
  clips: readonly RenderClip[]
  videoSrc: string | null
}) {
  const renders = snapshot.jobs.filter((job) => job.type === "render_clip")
  if (
    snapshot.status === "rendering" ||
    renders.some((job) => job.status === "running" || job.status === "queued")
  ) {
    return <RenderGrid jobs={renders} clips={clips} videoSrc={videoSrc} />
  }
  const active = snapshot.jobs.find(
    (job) => job.status === "running" && job.type !== "publish_clip"
  )
  const detail = active?.detail
  if (!detail) return null
  switch (detail.kind) {
    case "download":
      return <DownloadDetail detail={detail} />
    case "transcribe":
      return <TranscribeDetail detail={detail} />
    case "analyze":
      return <AnalyzeDetail detail={detail} />
    case "select":
      return <SelectDetail detail={detail} />
  }
}

function Facts({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function DownloadDetail({ detail }: { detail: Detail<"download"> }) {
  return (
    <Facts>
      <span data-testid="download-bytes">
        {formatBytes(detail.downloadedBytes)}
        {detail.totalBytes ? ` of ${formatBytes(detail.totalBytes)}` : ""}
      </span>
      {detail.bytesPerSecond && (
        <span>{formatBytes(detail.bytesPerSecond)}/s</span>
      )}
      {detail.etaSeconds && (
        <span>{formatDuration(detail.etaSeconds * 1000)} left</span>
      )}
    </Facts>
  )
}

function TranscribeDetail({ detail }: { detail: Detail<"transcribe"> }) {
  const minutes = detail.audioMs / 60_000
  const phase =
    detail.phase === "extracting"
      ? "Extracting the audio"
      : detail.phase === "detecting"
        ? "Listening for the spoken language"
        : detail.language
          ? `Transcribing in ${languageLabel(detail.language)}`
          : "Transcribing"
  return (
    <div className="flex flex-col gap-2">
      <Facts>
        <span>{phase}</span>
        {detail.language && detail.languageSource && (
          <span>({LANGUAGE_SOURCE[detail.languageSource]})</span>
        )}
        {detail.words > 0 && (
          <span>
            {detail.words.toLocaleString("en")} words
            {minutes >= 0.5 &&
              ` · ${Math.round(detail.words / minutes)} per minute`}
          </span>
        )}
        {detail.audioMs > 0 && <span>at {formatDuration(detail.audioMs)}</span>}
      </Facts>
      {detail.text && (
        <div className="flex h-24 flex-col justify-end overflow-hidden rounded-lg bg-muted px-3 py-2">
          <p
            role="log"
            aria-label="Latest transcribed words"
            data-testid="live-transcript"
            className="text-sm"
          >
            {detail.text}
          </p>
        </div>
      )}
    </div>
  )
}

function AnalyzeDetail({ detail }: { detail: Detail<"analyze"> }) {
  const loudness = React.useMemo(
    () => normalizeLoudness(detail.waveform),
    [detail.waveform]
  )
  if (!detail.durationMs) return null
  const pending = detail.durationMs - detail.analyzedMs
  return (
    <div className="flex flex-col gap-2">
      <Facts>
        <span>
          {formatDuration(detail.analyzedMs)} of{" "}
          {formatDuration(detail.durationMs)} analyzed
        </span>
        <span>
          {detail.silences.length}{" "}
          {detail.silences.length === 1 ? "silence" : "silences"} so far
        </span>
      </Facts>
      <Timeline
        readOnly
        durationMs={detail.durationMs}
        aria-label="Loudness analyzed so far"
        data-testid="live-waveform"
      >
        <TimelineLoudness values={loudness} />
        {detail.silences.map((silence) => (
          <TimelineRange
            key={silence.startMs}
            variant="silence"
            startMs={silence.startMs}
            endMs={silence.endMs}
          />
        ))}
        {pending > 0 && (
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 bg-muted/80"
            style={{ width: `${(pending / detail.durationMs) * 100}%` }}
          />
        )}
      </Timeline>
    </div>
  )
}

function SelectDetail({ detail }: { detail: Detail<"select"> }) {
  return (
    <div className="flex flex-col gap-2">
      <Facts>
        <span>
          {detail.candidates.length}{" "}
          {detail.candidates.length === 1 ? "candidate" : "candidates"} found
        </span>
        {detail.parts && (
          <span>
            {detail.parts.done} of {detail.parts.total} parts of the transcript
            read
          </span>
        )}
      </Facts>
      {detail.candidates.length > 0 && (
        <ol
          aria-label="Candidates found so far"
          className="flex flex-col gap-1 text-sm"
        >
          {detail.candidates.map((candidate) => (
            <li
              key={`${candidate.startMs}-${candidate.endMs}`}
              className="flex items-center gap-3"
            >
              <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                {formatDuration(candidate.startMs)}
              </span>
              <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
              <Badge variant="secondary" className="tabular-nums">
                {Math.round(candidate.score * 100)}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function RenderGrid({
  jobs,
  clips,
  videoSrc,
}: {
  jobs: readonly Job[]
  clips: readonly RenderClip[]
  videoSrc: string | null
}) {
  const latest = new Map<string, Job>()
  for (const job of jobs) {
    if (job.clipId && !latest.has(job.clipId)) latest.set(job.clipId, job)
  }
  const items = clips.filter((clip) => latest.has(clip.id))
  if (items.length === 0) return null
  return (
    <ul
      aria-label="Clips being rendered"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((clip) => {
        const job = latest.get(clip.id)!
        const label =
          job.status === "succeeded"
            ? "Done"
            : job.status === "failed"
              ? "Failed"
              : job.status === "queued"
                ? "Waiting"
                : `${job.progress}%`
        return (
          <li key={clip.id} className="flex min-w-0 flex-col gap-1.5">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
              {videoSrc && (
                <video
                  aria-hidden
                  muted
                  playsInline
                  preload="metadata"
                  src={`${videoSrc}#t=${(clip.startMs / 1000).toFixed(1)}`}
                  className="size-full object-cover"
                />
              )}
            </div>
            <p className="truncate text-sm font-medium">{clip.title}</p>
            <Progress
              value={job.status === "succeeded" ? 100 : job.progress}
              aria-label={`Rendering ${clip.title}`}
              getAriaValueText={() => label}
            />
            <p className="text-xs text-muted-foreground">{label}</p>
          </li>
        )
      })}
    </ul>
  )
}

let clock = 0

function subscribeToClock(onTick: () => void) {
  clock = Date.now()
  const timer = setInterval(() => {
    clock = Date.now()
    onTick()
  }, 1000)
  return () => clearInterval(timer)
}

const noClock = () => () => {}

// null on the server and while hydrating: the two clocks never agree.
export function useNow(active: boolean) {
  return React.useSyncExternalStore<number | null>(
    active ? subscribeToClock : noClock,
    () => (clock ||= Date.now()),
    () => null
  )
}
