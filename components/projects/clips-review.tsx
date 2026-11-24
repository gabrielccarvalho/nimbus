"use client"

import {
  ChecksIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  FileZipIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

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
import type { ClipPlayerData, RenderLinks } from "./clip-player-dialog"
import { ClipsGrid } from "./clips-grid"
import { useProjectEvents } from "./use-project-events"

type ClipsReviewProps = {
  projectId: string
  src: string
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
  renders: Record<string, RenderLinks>
  edit?: RenderLinks & { durationMs: number }
  layout: ClipPlayerData["layout"]
  captions: ClipPlayerData["captions"]
  captionsEnabled: boolean
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
}: Pick<
  ClipsReviewProps,
  "projectId" | "clips" | "renders" | "edit" | "layoutConfirmed" | "snapshot"
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
              className={buttonVariants({ size: "sm" })}
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
  layout,
  captions,
  captionsEnabled,
  layoutConfirmed,
  snapshot: initialSnapshot,
}: ClipsReviewProps) {
  const snapshot = useProjectEvents(initialSnapshot)
  const [openId, setOpenId] = React.useState<string | null>(null)
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
    : clips.filter((clip) => clip.status !== "rejected" || clip.id === openId)
  return (
    <>
      <ExportPanel
        projectId={projectId}
        clips={clips}
        renders={renders}
        edit={edit}
        layoutConfirmed={layoutConfirmed}
        snapshot={snapshot}
      />
      <div className="flex flex-col gap-3">
        <ClipsTimeline
          durationMs={durationMs}
          clips={visible}
          openId={openId}
          audio={audio}
          onOpen={setOpenId}
        />
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
              size="sm"
              disabled={finding || selecting}
              onClick={findMore}
            >
              <SparkleIcon data-icon="inline-start" aria-hidden />
              {selecting ? "Finding highlights…" : "Find more highlights"}
            </Button>
          </div>
        </div>
        <ClipsGrid
          projectId={projectId}
          src={src}
          clips={visible}
          renders={renders}
          layout={layout}
          captions={captions}
          captionsEnabled={captionsEnabled}
          openClipId={openId}
          onOpenClipIdChange={setOpenId}
        />
      </div>
    </>
  )
}

function ClipsTimeline({
  durationMs,
  clips,
  openId,
  audio,
  onOpen,
}: {
  durationMs: number
  clips: Clip[]
  openId: string | null
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
          variant={clip.id === openId ? "selected" : "clip"}
          title={clip.title}
          className="pointer-events-auto cursor-pointer"
          onClick={() => onOpen(clip.id)}
        />
      ))}
    </Timeline>
  )
}
