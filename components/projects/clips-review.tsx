"use client"

import {
  CaretDownIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FileZipIcon,
  MonitorPlayIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AppHeaderState } from "@/components/app-shell/app-header"
import {
  HEADER_STATE_SLOT_ID,
  HeaderSlot,
} from "@/components/app-shell/header-slot"
import { Button, buttonVariants } from "@/components/ui/button"
import { DotMeter } from "@/components/ui/dot-meter"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
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
import { ClipStats } from "./clip-stats"
import { ClipsGrid, type ClipCaptions, type RenderLinks } from "./clips-grid"
import type { PublishingState } from "./publish-dialog"
import { IconAction } from "./icon-action"
import { ClipStatusBadge } from "./status-badge"
import { TimelineDock } from "./timeline-dock"
import { useClipStatus } from "./use-clip-status"
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
  /** Shown above the grid: the manual selection form while it is pending. */
  children?: React.ReactNode
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

function useExport({
  clips,
  renders,
  snapshot,
}: Pick<ClipsReviewProps, "clips" | "renders" | "snapshot">) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const approved = clips.filter((clip) =>
    ["approved", "failed"].includes(clip.status)
  )
  const active = (type: string) =>
    snapshot.jobs.filter(
      (job) =>
        job.type === type &&
        (job.status === "running" || job.status === "queued")
    )
  const run = (action: () => Promise<Result<unknown>>, message: string) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error.message)
      else toast.success(message)
      router.refresh()
    })
  return {
    pending,
    run,
    approved,
    renderJobs: active("render_clip"),
    editJob: active("render_edit")[0],
    renderedCount: Object.keys(renders).length,
    candidates: clips.filter((clip) => clip.status === "candidate").length,
    renderMinutes: Math.ceil(
      approved.reduce((sum, clip) => sum + clip.endMs - clip.startMs, 0) /
        60_000
    ),
  }
}

function ClipInspector({
  projectId,
  clip,
  rank,
  publishing,
  note,
}: {
  projectId: string
  clip: Clip
  rank: number
  publishing: PublishingState
  note: string
}) {
  const { pending, setStatus } = useClipStatus(projectId, clip)
  const approved = ["approved", "rendering", "rendered"].includes(clip.status)
  const rejected = clip.status === "rejected"
  const locked = clip.status === "rendering" || clip.status === "rendered"
  const publication = publishing.publications[clip.id]
  return (
    <aside
      aria-label="Selected clip"
      className="flex w-full shrink-0 flex-col lg:w-[340px] lg:shadow-[inset_1px_0_0_var(--hair)]"
    >
      <div className="grid min-h-0 flex-1 content-start gap-[18px] p-4 lg:overflow-y-auto">
        <div className="flex items-center gap-2.5">
          <span className="mono-label">Selected · #{rank}</span>
          <span className="flex-1" />
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatDuration(clip.startMs)} ·{" "}
            {formatDuration(clip.endMs - clip.startMs)}
          </span>
        </div>
        <div className="grid gap-2">
          <h2 className="text-[19px] leading-tight font-semibold tracking-[-0.03em] text-balance">
            {clip.title}
          </h2>
          <ClipStatusBadge status={clip.status} />
        </div>
        <Segmented
          aria-label="Review decision"
          layout="fill"
          value={approved ? ["approved"] : rejected ? ["rejected"] : []}
          disabled={pending || locked}
          onValueChange={(next) =>
            setStatus(
              next[0] === "approved" || next[0] === "rejected"
                ? next[0]
                : "candidate"
            )
          }
        >
          <SegmentedItem
            value="rejected"
            className="aria-pressed:bg-pink/14 aria-pressed:text-pink aria-pressed:inset-ring-pink/40"
          >
            <XIcon aria-hidden />
            {rejected ? "Rejected" : "Reject"}
            <Kbd aria-hidden>X</Kbd>
          </SegmentedItem>
          <SegmentedItem
            value="approved"
            className="aria-pressed:bg-mint/18 aria-pressed:text-mint aria-pressed:inset-ring-mint/50"
          >
            <CheckIcon aria-hidden />
            {approved ? "Approved" : "Approve"}
            <Kbd aria-hidden>A</Kbd>
          </SegmentedItem>
        </Segmented>
        {(clip.reason || clip.score > 0) && (
          <div className="grid gap-2 rounded-[14px] bg-graphite-2 p-3.5">
            <div className="flex items-center gap-2.5">
              <DotMeter
                value={Math.round(clip.score * 10)}
                aria-label="Clip score"
                tone="mint"
              />
              <b className="text-[13px] font-semibold">Why this clip</b>
              <span className="ms-auto font-mono text-xs text-tertiary tabular-nums">
                {clip.score.toFixed(2)}
              </span>
            </div>
            {clip.reason && (
              <p className="text-[13px] text-tertiary">{clip.reason}</p>
            )}
          </div>
        )}
        {clip.hook && (
          <div className="grid gap-2">
            <span className="text-[13.5px] font-medium">Hook</span>
            <p className="rounded-xl bg-graphite-2 px-3.5 py-2.5 text-[15px] inset-ring-1 inset-ring-hair">
              {clip.hook}
            </p>
          </div>
        )}
        {publication &&
          (publication.status === "published" ||
            publication.status === "removed") && (
            <ClipStats publication={publication} />
          )}
        <Link
          href={`/projects/${projectId}/clips/${clip.id}`}
          className={buttonVariants({ className: "w-full" })}
        >
          Open in the editor
          <Kbd aria-hidden>Enter</Kbd>
        </Link>
      </div>
      <p className="px-4 py-3 text-[12.5px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]">
        {note}
      </p>
    </aside>
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
  children,
}: ClipsReviewProps) {
  const snapshot = useProjectEvents(initialSnapshot)
  const [filter, setFilter] = React.useState<Filter>("all")
  const [sort, setSort] = React.useState<"best" | "time">("best")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const router = useRouter()
  const [finding, startFinding] = React.useTransition()
  const selecting = snapshot.status === "selecting"
  const {
    pending,
    run,
    approved,
    renderJobs,
    editJob,
    renderedCount,
    candidates,
    renderMinutes,
  } = useExport({ clips, renders, snapshot })

  const findMore = () =>
    startFinding(async () => {
      const result = await findMoreHighlightsAction(projectId)
      if (!result.ok) toast.error(result.error.message)
      else toast.success("Looking for more highlights")
      router.refresh()
    })
  const open = (id: string) => router.push(`/projects/${projectId}/clips/${id}`)

  const byScore = clips.toSorted((a, b) => b.score - a.score)
  const ranks = Object.fromEntries(byScore.map((clip, i) => [clip.id, i + 1]))
  const counts = { all: clips.length, todo: 0, approved: 0, rejected: 0 }
  for (const clip of clips) counts[clipFilter(clip)] += 1
  const visible = (sort === "best" ? byScore : clips).filter(
    (clip) => filter === "all" || clipFilter(clip) === filter
  )
  const selected =
    visible.find((clip) => clip.id === selectedId) ?? visible[0] ?? null
  const summary = [
    approved.length > 0 && `${approved.length} approved`,
    renderedCount > 0 && `${renderedCount} rendered`,
    candidates > 0 && `${candidates} to review`,
  ]
    .filter(Boolean)
    .join(" · ")
  const note =
    approved.length > 0
      ? `Only approved clips render. About ${plural(renderMinutes, "render minute")} for ${plural(approved.length, "clip")}.`
      : "Only approved clips render."

  return (
    <>
      <HeaderSlot target={HEADER_STATE_SLOT_ID}>
        {summary && (
          <AppHeaderState role="status" data-testid="clips-summary">
            · {summary}
          </AppHeaderState>
        )}
      </HeaderSlot>
      <HeaderSlot>
        {edit && !editJob && (
          <IconAction
            label={`Download the horizontal edit (${formatDuration(edit.durationMs)})`}
            side="bottom"
            variant="default"
            nativeButton={false}
            render={<a href={edit.downloadUrl} download />}
          >
            <DownloadSimpleIcon aria-hidden />
          </IconAction>
        )}
        <Button
          disabled={pending || Boolean(editJob)}
          onClick={() =>
            run(() => renderEditAction(projectId), "Rendering the edit")
          }
        >
          <MonitorPlayIcon data-icon="inline-start" aria-hidden />
          {edit ? "Re-render horizontal edit" : "Render horizontal edit"}
        </Button>
        {renderedCount > 0 && (
          <IconAction
            label="Download all rendered clips"
            side="bottom"
            variant="default"
            nativeButton={false}
            render={<a href={`/api/projects/${projectId}/export`} download />}
          >
            <FileZipIcon aria-hidden />
          </IconAction>
        )}
        <Button
          variant="primary"
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
          {approved.length > 0 && (
            <span className="font-mono text-xs tabular-nums">
              {approved.length}
            </span>
          )}
        </Button>
      </HeaderSlot>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Clips to review"
          className="flex min-w-0 flex-1 flex-col"
        >
          <div
            role="toolbar"
            aria-label="Clip tools"
            className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-[18px] py-1.5 shadow-[inset_0_-1px_0_var(--hair)]"
          >
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
                  className="inline-flex h-[30px] items-center gap-[7px] rounded-full px-3 text-[13.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-glass hover:text-foreground focus-visible:focus-ring aria-pressed:bg-glass-3 aria-pressed:text-foreground"
                >
                  {item.label}{" "}
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {counts[item.id]}
                  </span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {candidates > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => approveAllCandidatesAction(projectId),
                    `Approved ${plural(candidates, "clip")}`
                  )
                }
              >
                <CheckIcon data-icon="inline-start" aria-hidden />
                Approve all {candidates}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-[30px] items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:bg-glass hover:text-foreground focus-visible:focus-ring">
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
            <Button
              size="sm"
              variant="ghost"
              disabled={finding || selecting}
              onClick={findMore}
            >
              <SparkleIcon data-icon="inline-start" aria-hidden />
              {selecting ? "Finding highlights…" : "Find more highlights"}
            </Button>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-[18px] p-[18px] lg:overflow-y-auto">
            {children}
            {renderJobs.length > 0 && (
              <div className="flex items-end gap-3 rounded-[14px] bg-graphite px-4 py-3">
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
              <div className="flex items-end gap-3 rounded-[14px] bg-graphite px-4 py-3">
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
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onOpen={open}
              />
            )}
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] text-tertiary">
              Click a clip to select it, double-click to edit it.
              <Kbd>A</Kbd> approve · <Kbd>X</Kbd> reject · <Kbd>←</Kbd>{" "}
              <Kbd>→</Kbd> next · <Kbd>Enter</Kbd> open
            </p>
          </div>
        </section>
        {selected && (
          <ClipInspector
            key={selected.id}
            projectId={projectId}
            clip={selected}
            rank={ranks[selected.id] ?? 1}
            publishing={publishing}
            note={note}
          />
        )}
      </div>
      <TimelineDock
        label="Where the clips are"
        durationMs={durationMs}
        summary={`${clips.length - counts.rejected} across ${formatDuration(durationMs)}`}
        legend={[
          { kind: "clip", label: "Clip" },
          { kind: "selected", label: "Selected" },
          ...(audio
            ? [
                { kind: "silence" as const, label: "Silence" },
                ...(audio.audience.length > 0
                  ? [
                      {
                        kind: "audience" as const,
                        label: "Most rewatched on YouTube",
                      },
                    ]
                  : []),
              ]
            : []),
        ]}
      >
        <ClipsTimeline
          durationMs={durationMs}
          clips={clips.filter((clip) => clip.status !== "rejected")}
          audio={audio}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onOpen={open}
        />
      </TimelineDock>
    </>
  )
}

function ClipsTimeline({
  durationMs,
  clips,
  audio,
  selectedId,
  onSelect,
  onOpen,
}: {
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <Timeline
      aria-label="Clips in the recording"
      durationMs={durationMs}
      readOnly
    >
      {audio && <AudioTimelineLayers audio={audio} />}
      {clips.map((clip) => (
        <TimelineRange
          key={clip.id}
          startMs={clip.startMs}
          endMs={clip.endMs}
          variant={clip.id === selectedId ? "selected" : "clip"}
          title={clip.title}
          className="pointer-events-auto min-w-1 cursor-pointer"
          onClick={() => onSelect(clip.id)}
          onDoubleClick={() => onOpen(clip.id)}
        />
      ))}
    </Timeline>
  )
}
