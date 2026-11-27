"use client"

import {
  CaretDownIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileZipIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Timeline, TimelineRange } from "@/components/ui/timeline"
import { approveAllCandidatesAction } from "@/features/clips/actions"
import { clipParts } from "@/features/clips/parts"
import type { Clip } from "@/features/clips/repository"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import { findMoreHighlightsAction } from "@/features/projects/actions"
import type { AudioSummary } from "@/features/projects/queries"
import {
  cancelClipRendersAction,
  cancelEditRenderAction,
  renderClipsAction,
  renderEditAction,
} from "@/features/render/actions"
import type { Result } from "@/lib/errors"
import { formatDuration } from "@/lib/format"
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { AudioTimelineLayers } from "./audio-timeline"
import { ClipsGrid, type ClipCaptions, type RenderLinks } from "./clips-grid"
import { review } from "./messages/review"
import type { PublishingState } from "./publish-dialog"
import { useProjectEvents } from "./use-project-events"

type ClipsReviewProps = {
  projectId: string
  src: string
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
  renders: Record<string, RenderLinks>
  edit?: RenderLinks & { durationMs: number }
  captions: ClipCaptions
  snapshot: ProjectSnapshot
  publishing: PublishingState
}

const FILTERS = ["all", "todo", "approved", "rejected"] as const

type Filter = (typeof FILTERS)[number]

function clipFilter(clip: Clip): Exclude<Filter, "all"> {
  if (clip.status === "candidate") return "todo"
  if (clip.status === "rejected") return "rejected"
  return "approved"
}

function ExportBar({
  projectId,
  clips,
  renders,
  edit,
  snapshot,
}: Pick<
  ClipsReviewProps,
  "projectId" | "clips" | "renders" | "edit" | "snapshot"
>) {
  const t = useMessages(review).bar
  const shared = useMessages(common)
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const approved = clips.filter((clip) =>
    ["approved", "failed"].includes(clip.status)
  )
  const renderJobs = snapshot.jobs.filter(
    (job) =>
      job.type === "render_clip" &&
      (job.status === "running" || job.status === "queued")
  )
  const editJob = snapshot.jobs.find(
    (job) =>
      job.type === "render_edit" &&
      (job.status === "running" || job.status === "queued")
  )
  const renderedCount = Object.keys(renders).length
  const candidates = clips.filter((clip) => clip.status === "candidate").length
  const renderMinutes = Math.ceil(
    approved.reduce((sum, clip) => sum + clip.endMs - clip.startMs, 0) / 60_000
  )
  const summary = [
    approved.length > 0 && t.approved(approved.length),
    renderedCount > 0 && t.rendered(renderedCount),
    candidates > 0 && t.toReview(candidates),
  ]
    .filter(Boolean)
    .join(" · ")

  const run = (action: () => Promise<Result<unknown>>, message: string) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error.message)
      else toast.success(message)
      router.refresh()
    })

  return (
    <section className="grid gap-4 rounded-[18px] bg-graphite px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 flex-[1_1_260px] gap-1">
          <b className="text-[15px] font-semibold">{summary || t.empty}</b>
          <span className="text-[13px] text-tertiary">
            {approved.length > 0
              ? t.onlyApprovedMinutes(renderMinutes)
              : t.onlyApproved}
          </span>
        </div>
        {candidates > 0 && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => approveAllCandidatesAction(projectId),
                t.approvedToast(candidates)
              )
            }
          >
            {t.approveAll(candidates)}
          </Button>
        )}
        {renderedCount > 0 && (
          <a
            href={`/api/projects/${projectId}/export`}
            download
            className={buttonVariants({ size: "sm" })}
          >
            <FileZipIcon data-icon="inline-start" aria-hidden />
            {t.downloadAll}
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" aria-label={t.moreExports} />}
          >
            <DotsThreeIcon weight="bold" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuItem
              disabled={pending || Boolean(editJob)}
              onClick={() =>
                run(() => renderEditAction(projectId), t.renderingEditToast)
              }
            >
              {t.renderEdit}
            </DropdownMenuItem>
            {edit && !editJob && (
              <DropdownMenuItem render={<a href={edit.downloadUrl} download />}>
                <DownloadSimpleIcon aria-hidden />
                {t.downloadEdit(formatDuration(edit.durationMs))}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="primary"
          size="sm"
          disabled={pending || approved.length === 0}
          onClick={() =>
            run(
              () =>
                renderClipsAction(
                  projectId,
                  approved.map((clip) => clip.id)
                ),
              t.renderingClips(approved.length)
            )
          }
        >
          {t.renderApproved}
        </Button>
      </div>
      {renderJobs.length > 0 && (
        <div className="flex items-end gap-3">
          <Progress
            className="flex-1"
            value={
              renderJobs.reduce((sum, job) => sum + job.progress, 0) /
              renderJobs.length
            }
            aria-live="polite"
          >
            <ProgressLabel>{t.renderingClips(renderJobs.length)}</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => cancelClipRendersAction(projectId), t.cancelledClips)
            }
          >
            <XIcon data-icon="inline-start" aria-hidden />
            {shared.cancel}
          </Button>
        </div>
      )}
      {editJob && (
        <div className="flex items-end gap-3">
          <Progress
            className="flex-1"
            value={editJob.status === "running" ? editJob.progress : null}
            aria-live="polite"
          >
            <ProgressLabel>{t.renderingEdit}</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => cancelEditRenderAction(projectId), t.cancelledEdit)
            }
          >
            <XIcon data-icon="inline-start" aria-hidden />
            {shared.cancel}
          </Button>
        </div>
      )}
    </section>
  )
}

export function ClipsReview({
  projectId,
  src,
  durationMs,
  clips,
  audio,
  renders,
  edit,
  captions,
  snapshot: initialSnapshot,
  publishing,
}: ClipsReviewProps) {
  const t = useMessages(review).list
  const snapshot = useProjectEvents(initialSnapshot)
  const [filter, setFilter] = React.useState<Filter>("all")
  const [sort, setSort] = React.useState<"best" | "time">("best")
  const router = useRouter()
  const [finding, startFinding] = React.useTransition()
  const selecting = snapshot.status === "selecting"
  const findMore = () =>
    startFinding(async () => {
      const result = await findMoreHighlightsAction(projectId)
      if (!result.ok) toast.error(result.error.message)
      else toast.success(t.findingToast)
      router.refresh()
    })
  const byScore = clips.toSorted((a, b) => b.score - a.score)
  const ranks = Object.fromEntries(byScore.map((clip, i) => [clip.id, i + 1]))
  const counts = { all: clips.length, todo: 0, approved: 0, rejected: 0 }
  for (const clip of clips) counts[clipFilter(clip)] += 1
  const visible = (sort === "best" ? byScore : clips).filter(
    (clip) => filter === "all" || clipFilter(clip) === filter
  )
  return (
    <>
      <ExportBar
        projectId={projectId}
        clips={clips}
        renders={renders}
        edit={edit}
        snapshot={snapshot}
      />
      <ClipsTimeline
        durationMs={durationMs}
        clips={clips.filter((clip) => clip.status !== "rejected")}
        audio={audio}
        onOpen={(id) => router.push(`/projects/${projectId}/clips/${id}`)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t.filter}
          className="flex flex-wrap gap-0.5"
        >
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-pressed:bg-glass-3 aria-pressed:text-foreground"
            >
              {t.filters[id]}{" "}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground">
              {t.sort[sort]}
              <CaretDownIcon className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => setSort(value as "best" | "time")}
              >
                <DropdownMenuRadioItem value="best">
                  {t.sort.best}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="time">
                  {t.sort.time}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" disabled={finding || selecting} onClick={findMore}>
            <SparkleIcon data-icon="inline-start" aria-hidden />
            {selecting ? t.finding : t.findMore}
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-tertiary">{t.empty}</p>
      ) : (
        <ClipsGrid
          projectId={projectId}
          src={src}
          clips={visible}
          ranks={ranks}
          renders={renders}
          captions={captions}
          publishing={publishing}
        />
      )}
      <p className="text-center text-[13px] text-tertiary">
        {t.hint} <Kbd>A</Kbd> {t.hintApprove} · <Kbd>X</Kbd> {t.hintReject} ·{" "}
        <Kbd>←</Kbd> <Kbd>→</Kbd> {t.hintNext}
      </p>
    </>
  )
}

function ClipsTimeline({
  durationMs,
  clips,
  audio,
  onOpen,
}: {
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
  onOpen: (id: string) => void
}) {
  const t = useMessages(review).list
  return (
    <Timeline
      aria-label={t.timeline}
      durationMs={durationMs}
      readOnly
      className="h-10"
    >
      {audio && <AudioTimelineLayers audio={audio} />}
      {clips.flatMap((clip) =>
        clipParts(clip).map((part) => (
          <TimelineRange
            key={`${clip.id}:${part.startMs}`}
            startMs={part.startMs}
            endMs={part.endMs}
            variant="clip"
            title={clip.title}
            className="pointer-events-auto cursor-pointer"
            onClick={() => onOpen(clip.id)}
          />
        ))
      )}
    </Timeline>
  )
}
