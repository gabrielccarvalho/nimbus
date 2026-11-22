"use client"

import { CheckIcon, PlayIcon, XIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import type { AudioSummary } from "@/features/projects/queries"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

import { AudioTimelineLayers } from "./audio-timeline"

type ClipsReviewProps = {
  projectId: string
  src: string
  durationMs: number
  clips: Clip[]
  audio?: AudioSummary
}

export function ClipsReview({
  projectId,
  src,
  durationMs,
  clips,
  audio,
}: ClipsReviewProps) {
  const [selectedId, setSelectedId] = React.useState(clips[0]?.id)
  return (
    <VideoPlayerProvider>
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
        <ol aria-label="Clip candidates" className="flex flex-col gap-3">
          {clips.map((clip, index) => (
            <ClipCard
              key={clip.id}
              rank={index + 1}
              projectId={projectId}
              clip={clip}
              selected={clip.id === selectedId}
              onSelect={() => setSelectedId(clip.id)}
            />
          ))}
        </ol>
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
  selected,
  onSelect,
}: {
  rank: number
  projectId: string
  clip: Clip
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
      </div>
    </li>
  )
}
