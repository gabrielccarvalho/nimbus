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

import { AudioTimelineLayers } from "./audio-timeline"
import { ClipsGrid, type ClipCaptions, type RenderLinks } from "./clips-grid"
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

const FILTERS = [
  { id: "all", label: "All" },
  { id: "todo", label: "To review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const

type Filter = (typeof FILTERS)[number]["id"]

function clipFilter(clip: Clip): Exclude<Filter, "all"> {
  if (clip.status === "candidate") return "todo"
  if (clip.status === "rejected") return "rejected"
  return "approved"
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

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
    approved.length > 0 && `${approved.length} approved`,
    renderedCount > 0 && `${renderedCount} rendered`,
    candidates > 0 && `${candidates} to review`,
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
          <b className="text-[15px] font-semibold">
            {summary || "No clips yet"}
          </b>
          <span className="text-[13px] text-tertiary">
            {approved.length > 0
              ? `Only approved clips render. About ${plural(renderMinutes, "render minute")}.`
              : "Only approved clips render."}
          </span>
        </div>
        {candidates > 0 && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => approveAllCandidatesAction(projectId),
                `Approved ${plural(candidates, "clip")}`
              )
            }
          >
            Approve all {candidates}
          </Button>
        )}
        {renderedCount > 0 && (
          <a
            href={`/api/projects/${projectId}/export`}
            download
            className={buttonVariants({ size: "sm" })}
          >
            <FileZipIcon data-icon="inline-start" aria-hidden />
            Download all
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                aria-label="More exports: horizontal edit"
              />
            }
          >
            <DotsThreeIcon weight="bold" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuItem
              disabled={pending || Boolean(editJob)}
              onClick={() =>
                run(() => renderEditAction(projectId), "Rendering the edit")
              }
            >
              Render horizontal edit
            </DropdownMenuItem>
            {edit && !editJob && (
              <DropdownMenuItem render={<a href={edit.downloadUrl} download />}>
                <DownloadSimpleIcon aria-hidden />
                Download edit ({formatDuration(edit.durationMs)})
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
              `Rendering ${plural(approved.length, "clip")}`
            )
          }
        >
          Render approved clips
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
            <ProgressLabel>
              Rendering {plural(renderJobs.length, "clip")}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelClipRendersAction(projectId),
                "Cancelled clip renders"
              )
            }
          >
            <XIcon data-icon="inline-start" aria-hidden />
            Cancel
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
            <ProgressLabel>Rendering the horizontal edit</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelEditRenderAction(projectId),
                "Cancelled the edit render"
              )
            }
          >
            <XIcon data-icon="inline-start" aria-hidden />
            Cancel
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
      else toast.success("Looking for more highlights")
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
          aria-label="Filter clips"
          className="flex flex-wrap gap-0.5"
        >
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-pressed:bg-glass-3 aria-pressed:text-foreground"
            >
              {item.label}{" "}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {counts[item.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground">
              {sort === "best" ? "Best first" : "In order"}
              <CaretDownIcon className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => setSort(value as "best" | "time")}
              >
                <DropdownMenuRadioItem value="best">
                  Best first
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="time">
                  In order
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" disabled={finding || selecting} onClick={findMore}>
            <SparkleIcon data-icon="inline-start" aria-hidden />
            {selecting ? "Finding highlights…" : "Find more highlights"}
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-tertiary">
          Nothing here right now.
        </p>
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
        Click a clip to open it in the editor. <Kbd>A</Kbd> approve ·{" "}
        <Kbd>X</Kbd> reject · <Kbd>←</Kbd> <Kbd>→</Kbd> next
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
  return (
    <Timeline
      aria-label="Clips in the recording"
      durationMs={durationMs}
      readOnly
      className="h-10"
    >
      {audio && <AudioTimelineLayers audio={audio} />}
      {clips.map((clip) => (
        <TimelineRange
          key={clip.id}
          startMs={clip.startMs}
          endMs={clip.endMs}
          variant="clip"
          title={clip.title}
          className="pointer-events-auto cursor-pointer"
          onClick={() => onOpen(clip.id)}
        />
      ))}
    </Timeline>
  )
}
