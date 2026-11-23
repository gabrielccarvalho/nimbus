"use client"

import {
  CheckIcon,
  ChecksIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  FileZipIcon,
  PencilSimpleIcon,
  PlayIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import {
  Timeline,
  TimelinePlayhead,
  TimelineRange,
} from "@/components/ui/timeline"
import {
  useVideoPlayer,
  VideoPlayer,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import {
  approveAllCandidatesAction,
  setClipStatusAction,
} from "@/features/clips/actions"
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
import { cn } from "@/lib/utils"

import { AudioTimelineLayers } from "./audio-timeline"
import { useProjectEvents } from "./use-project-events"

type RenderLinks = { url: string; downloadUrl: string }

type ClipsReviewProps = {
  projectId: string
  src: string
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
  renders: Record<string, RenderLinks>
  edit?: RenderLinks & { durationMs: number }
  layoutConfirmed: boolean
  snapshot: ProjectSnapshot
}

function ExportPanel({
  projectId,
  clips,
  renders,
  edit,
  layoutConfirmed,
  snapshot,
}: Omit<ClipsReviewProps, "src" | "durationMs" | "audio">) {
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

  const run = (action: () => Promise<Result<unknown>>, message: string) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error.message)
      else toast.success(message)
      router.refresh()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>
          {layoutConfirmed
            ? `${approved.length} approved to render · ${renderedCount} rendered`
            : "Confirm the layout before rendering."}
        </CardDescription>
        {(renderedCount > 0 || edit) && (
          <CardAction>
            <a
              href={`/api/projects/${projectId}/export`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileZipIcon data-icon="inline-start" aria-hidden />
              Download all
            </a>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {candidates > 0 && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => approveAllCandidatesAction(projectId),
                  `Approved ${candidates} ${candidates === 1 ? "clip" : "clips"}`
                )
              }
            >
              <ChecksIcon data-icon="inline-start" aria-hidden />
              Approve all ({candidates})
            </Button>
          )}
          <Button
            disabled={pending || !layoutConfirmed || approved.length === 0}
            onClick={() =>
              run(
                () =>
                  renderClipsAction(
                    projectId,
                    approved.map((clip) => clip.id)
                  ),
                `Rendering ${approved.length} ${approved.length === 1 ? "clip" : "clips"}`
              )
            }
          >
            <FilmSlateIcon data-icon="inline-start" aria-hidden />
            Render approved clips
          </Button>
          <Button
            variant="outline"
            disabled={pending || Boolean(editJob)}
            onClick={() =>
              run(() => renderEditAction(projectId), "Rendering the edit")
            }
          >
            Render horizontal edit
          </Button>
          {edit && !editJob && (
            <a
              href={edit.downloadUrl}
              download
              className={buttonVariants({ variant: "ghost" })}
            >
              <DownloadSimpleIcon data-icon="inline-start" aria-hidden />
              Edit ({formatDuration(edit.durationMs)})
            </a>
          )}
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
                Rendering {renderJobs.length}{" "}
                {renderJobs.length === 1 ? "clip" : "clips"}
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
      </CardContent>
    </Card>
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
  layoutConfirmed,
  snapshot: initialSnapshot,
}: ClipsReviewProps) {
  const snapshot = useProjectEvents(initialSnapshot)
  const [selectedId, setSelectedId] = React.useState(clips[0]?.id)
  const [showRejected, setShowRejected] = React.useState(false)
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
  const rejected = clips.filter((clip) => clip.status === "rejected").length
  const visible = showRejected
    ? clips
    : clips.filter((clip) => clip.status !== "rejected")
  return (
    <VideoPlayerProvider>
      <ExportPanel
        projectId={projectId}
        clips={clips}
        renders={renders}
        edit={edit}
        layoutConfirmed={layoutConfirmed}
        snapshot={snapshot}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <VideoPlayer aria-label="Source video">
            <VideoPlayerVideo src={src} />
            <VideoPlayerControls>
              <VideoPlayerPlayButton />
              <VideoPlayerSeekBar />
              <VideoPlayerTime />
              <VideoPlayerMuteButton />
            </VideoPlayerControls>
          </VideoPlayer>
          <ClipsTimeline
            durationMs={durationMs}
            clips={clips}
            selectedId={selectedId}
            audio={audio}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {rejected > 0 &&
                `${rejected} rejected ${rejected === 1 ? "clip" : "clips"} ${showRejected ? "shown" : "hidden"}`}
            </span>
            <div className="flex gap-1">
              {rejected > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={showRejected}
                  onClick={() => setShowRejected((value) => !value)}
                >
                  {showRejected ? "Hide rejected" : "Show rejected"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={finding || selecting}
                onClick={findMore}
              >
                <SparkleIcon data-icon="inline-start" aria-hidden />
                {selecting ? "Finding highlights…" : "Find more highlights"}
              </Button>
            </div>
          </div>
          <ol aria-label="Clip candidates" className="flex flex-col gap-3">
            {visible.map((clip, index) => (
              <ClipCard
                key={clip.id}
                rank={index + 1}
                projectId={projectId}
                clip={clip}
                render={renders[clip.id]}
                selected={clip.id === selectedId}
                onSelect={() => setSelectedId(clip.id)}
              />
            ))}
          </ol>
        </div>
      </div>
    </VideoPlayerProvider>
  )
}

function ClipsTimeline({
  durationMs,
  clips,
  selectedId,
  audio,
}: {
  durationMs: number
  clips: Clip[]
  selectedId?: string
  audio?: AudioSummary
}) {
  const { currentMs, seek } = useVideoPlayer()
  return (
    <Timeline
      aria-label="Timeline"
      durationMs={durationMs}
      value={currentMs}
      onValueChange={seek}
    >
      {audio && <AudioTimelineLayers audio={audio} />}
      {clips
        .filter((clip) => clip.status !== "rejected")
        .map((clip) => (
          <TimelineRange
            key={clip.id}
            startMs={clip.startMs}
            endMs={clip.endMs}
            variant={clip.id === selectedId ? "selected" : "clip"}
          />
        ))}
      <TimelinePlayhead />
    </Timeline>
  )
}

const STATUS_LABELS: Record<Clip["status"], string> = {
  candidate: "Candidate",
  approved: "Approved",
  rejected: "Rejected",
  rendering: "Rendering",
  rendered: "Rendered",
  failed: "Render failed",
}

function ClipCard({
  rank,
  projectId,
  clip,
  render,
  selected,
  onSelect,
}: {
  rank: number
  projectId: string
  clip: Clip
  render?: RenderLinks
  selected: boolean
  onSelect: () => void
}) {
  const router = useRouter()
  const { seek, play } = useVideoPlayer()
  const [pending, startTransition] = React.useTransition()
  const headingId = `clip-${clip.id}-title`

  const setStatus = (status: Clip["status"]) =>
    startTransition(async () => {
      const result = await setClipStatusAction(projectId, clip.id, status)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      if (status === "rejected") {
        toast(`Rejected “${clip.title}”`, {
          action: {
            label: "Undo",
            onClick: () => {
              void setClipStatusAction(projectId, clip.id, clip.status).then(
                () => router.refresh()
              )
            },
          },
        })
      }
      router.refresh()
    })

  return (
    <li
      aria-labelledby={headingId}
      data-status={clip.status}
      data-selected={selected || undefined}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 transition-colors data-[status=rejected]:opacity-60 data-selected:border-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={headingId} className="font-medium">
          <span className="sr-only">Clip {rank}: </span>
          {clip.title}
        </h3>
        <Badge variant={clip.status === "approved" ? "default" : "secondary"}>
          {STATUS_LABELS[clip.status]}
        </Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatDuration(clip.startMs)}–{formatDuration(clip.endMs)} ·{" "}
        {Math.round((clip.endMs - clip.startMs) / 1000)} s · score{" "}
        {clip.score.toFixed(2)}
      </p>
      {clip.hook && <p className="text-sm">“{clip.hook}”</p>}
      {clip.reason && (
        <p className="text-xs text-muted-foreground">{clip.reason}</p>
      )}
      {clip.status === "failed" && clip.error && (
        <p className="text-xs break-words text-destructive">{clip.error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onSelect()
            seek(clip.startMs)
            play()
          }}
        >
          <PlayIcon data-icon="inline-start" aria-hidden />
          Preview
        </Button>
        <Button
          size="sm"
          variant={clip.status === "approved" ? "default" : "outline"}
          aria-pressed={clip.status === "approved"}
          disabled={pending || clip.status === "rendering"}
          onClick={() =>
            setStatus(clip.status === "approved" ? "candidate" : "approved")
          }
        >
          <CheckIcon data-icon="inline-start" aria-hidden />
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={clip.status === "rejected"}
          disabled={pending || clip.status === "rendering"}
          onClick={() =>
            setStatus(clip.status === "rejected" ? "candidate" : "rejected")
          }
        >
          <XIcon data-icon="inline-start" aria-hidden />
          Reject
        </Button>
        <Link
          href={`/projects/${projectId}/clips/${clip.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <PencilSimpleIcon data-icon="inline-start" aria-hidden />
          Edit
          <span className="sr-only"> {clip.title}</span>
        </Link>
        {render && (
          <a
            href={render.downloadUrl}
            download
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <DownloadSimpleIcon data-icon="inline-start" aria-hidden />
            Download
            <span className="sr-only"> {clip.title}</span>
          </a>
        )}
      </div>
    </li>
  )
}
