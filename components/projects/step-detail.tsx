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
import { useLocale, useMessages } from "@/lib/i18n/client"

import { overview } from "./messages/overview"

export type RenderClip = {
  id: string
  title: string
  startMs: number
  endMs: number
}

type Job = ProjectSnapshot["jobs"][number]
type Detail<K extends StepDetail["kind"]> = Extract<StepDetail, { kind: K }>

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
  const t = useMessages(overview).stepDetail
  const locale = useLocale()
  return (
    <Facts>
      <span data-testid="download-bytes">
        {t.downloaded(
          formatBytes(detail.downloadedBytes, locale),
          detail.totalBytes ? formatBytes(detail.totalBytes, locale) : null
        )}
      </span>
      {detail.bytesPerSecond && (
        <span>{t.perSecond(formatBytes(detail.bytesPerSecond, locale))}</span>
      )}
      {detail.etaSeconds && (
        <span>{t.left(formatDuration(detail.etaSeconds * 1000))}</span>
      )}
    </Facts>
  )
}

function TranscribeDetail({ detail }: { detail: Detail<"transcribe"> }) {
  const locale = useLocale()
  const t = overview[locale].stepDetail
  const minutes = detail.audioMs / 60_000
  const phase =
    detail.phase === "extracting"
      ? t.extracting
      : detail.phase === "skipped"
        ? t.skipping
        : detail.phase === "detecting"
          ? t.detecting
          : detail.language
            ? t.transcribingIn(languageLabel(detail.language, locale))
            : t.transcribing
  return (
    <div className="flex flex-col gap-2">
      <Facts>
        <span>{phase}</span>
        {detail.language && detail.languageSource && (
          <span>({t.languageSources[detail.languageSource]})</span>
        )}
        {detail.words > 0 && (
          <span>
            {t.words(detail.words.toLocaleString(locale))}
            {minutes >= 0.5 &&
              ` · ${t.perMinute(Math.round(detail.words / minutes))}`}
          </span>
        )}
        {detail.audioMs > 0 && (
          <span>{t.at(formatDuration(detail.audioMs))}</span>
        )}
      </Facts>
      {detail.text && (
        <div className="flex h-24 flex-col justify-end overflow-hidden rounded-lg bg-muted px-3 py-2">
          <p
            role="log"
            aria-label={t.latestWords}
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
  const t = useMessages(overview).stepDetail
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
          {t.analyzed(
            formatDuration(detail.analyzedMs),
            formatDuration(detail.durationMs)
          )}
        </span>
        <span>{t.silencesSoFar(detail.silences.length)}</span>
      </Facts>
      <Timeline
        readOnly
        durationMs={detail.durationMs}
        aria-label={t.loudnessSoFar}
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
  const t = useMessages(overview).stepDetail
  return (
    <div className="flex flex-col gap-2">
      <Facts>
        <span>{t.candidatesFound(detail.candidates.length)}</span>
        {detail.parts && (
          <span>{t.partsRead(detail.parts.done, detail.parts.total)}</span>
        )}
      </Facts>
      {detail.candidates.length > 0 && (
        <ol
          aria-label={t.candidatesSoFar}
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
  const t = useMessages(overview).stepDetail
  const latest = new Map<string, Job>()
  for (const job of jobs) {
    if (job.clipId && !latest.has(job.clipId)) latest.set(job.clipId, job)
  }
  const items = clips.filter((clip) => latest.has(clip.id))
  if (items.length === 0) return null
  return (
    <ul
      aria-label={t.rendering}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((clip) => {
        const job = latest.get(clip.id)!
        const label =
          job.status === "succeeded"
            ? t.done
            : job.status === "failed"
              ? t.failed
              : job.status === "queued"
                ? t.waiting
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
              aria-label={t.renderingClip(clip.title)}
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
