"use client"

import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  VideoPlayer,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerProvider,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
} from "@/components/ui/video-player"
import type { CaptionLane } from "@/features/captions/pages"
import type { CaptionStyle } from "@/features/captions/styles"
import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import { renderableLayout } from "@/features/layout/schema"
import { formatDuration } from "@/lib/format"

import { ClipLoop, ClipPreview } from "./clip-preview"
import { ClipStats } from "./clip-stats"
import { PublishControl, type PublishingState } from "./publish-dialog"
import { ClipStatusBadge } from "./status-badge"

export type RenderLinks = { url: string; downloadUrl: string }

export type ClipPlayerData = {
  projectId: string
  src: string
  renders: Record<string, RenderLinks>
  captions: Record<
    string,
    {
      lanes: CaptionLane<number | null>[]
      style: CaptionStyle
      enabled: boolean
    }
  >
  publishing: PublishingState
}

export function currentRender(
  clip: Clip,
  renders: Record<string, RenderLinks>
) {
  return clip.status === "rendered" ? renders[clip.id] : undefined
}

export function useClipStatus(projectId: string, clip: Clip) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

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

  return { pending, setStatus }
}

function ClipPlayer({
  clip,
  src,
  renders,
  captions,
}: Omit<ClipPlayerData, "projectId" | "publishing"> & { clip: Clip }) {
  const render = currentRender(clip, renders)
  const layout = renderableLayout(clip.layout)
  const caption = captions[clip.id]

  if (render) {
    return (
      <VideoPlayer
        aspect="vertical"
        aria-label="Rendered clip"
        className="overflow-hidden rounded-lg bg-black"
      >
        <VideoPlayerVideo src={render.url} autoPlay loop />
        <VideoPlayerControls>
          <VideoPlayerPlayButton />
          <VideoPlayerSeekBar />
          <VideoPlayerTime />
          <VideoPlayerMuteButton />
        </VideoPlayerControls>
      </VideoPlayer>
    )
  }

  return (
    <VideoPlayerProvider>
      <ClipLoop startMs={clip.startMs} endMs={clip.endMs} />
      <div className="relative overflow-hidden rounded-lg bg-black">
        {caption ? (
          <>
            <VideoPlayerVideo
              src={src}
              autoPlay
              className="pointer-events-none absolute size-px opacity-0"
            />
            <ClipPreview
              layout={layout}
              effects={clip.effects?.events}
              lanes={caption.lanes}
              startMs={clip.startMs}
              captionStyle={caption.style}
              captionsEnabled={caption.enabled}
              overlays={clip.textOverlays}
              className="rounded-none"
            />
          </>
        ) : (
          <VideoPlayerVideo
            src={src}
            autoPlay
            aria-label="Source video"
            className="aspect-[9/16] object-contain"
          />
        )}
        <VideoPlayerControls>
          <VideoPlayerPlayButton />
          <span className="flex-1" />
          <VideoPlayerMuteButton />
        </VideoPlayerControls>
      </div>
    </VideoPlayerProvider>
  )
}

export function ClipPlayerDialog({
  open,
  onOpenChange,
  clips,
  index,
  onIndexChange,
  finalFocus,
  ...data
}: ClipPlayerData & {
  open: boolean
  onOpenChange(open: boolean): void
  clips: Clip[]
  index: number
  onIndexChange(index: number): void
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const clip = clips[index]
  const popupRef = React.useRef<HTMLDivElement>(null)
  const move = (step: number) => {
    const next = index + step
    if (next >= 0 && next < clips.length) onIndexChange(next)
  }

  return (
    <Dialog
      open={open && Boolean(clip)}
      onOpenChange={(next) => {
        if (!next) {
          popupRef.current
            ?.querySelectorAll("video")
            .forEach((video) => video.pause())
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        ref={popupRef}
        initialFocus={popupRef}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        onKeyDown={(event) => {
          if (event.defaultPrevented) return
          const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
          if (step === undefined) return
          event.preventDefault()
          move(step)
        }}
      >
        {clip && (
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[calc(70dvh*9/16)] sm:w-[calc(70dvh*9/16)]">
              <ClipPlayer key={clip.id} clip={clip} {...data} />
            </div>
            <ClipDetails
              projectId={data.projectId}
              clip={clip}
              render={currentRender(clip, data.renders)}
              publishing={data.publishing}
              position={index + 1}
              total={clips.length}
              onMove={move}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ClipDetails({
  projectId,
  clip,
  render,
  publishing,
  position,
  total,
  onMove,
}: {
  projectId: string
  clip: Clip
  render?: RenderLinks
  publishing: PublishingState
  position: number
  total: number
  onMove: (step: number) => void
}) {
  const { pending, setStatus } = useClipStatus(projectId, clip)
  const publication = publishing.publications[clip.id]
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:pt-6">
      <DialogHeader>
        <ClipStatusBadge status={clip.status} />
        <DialogTitle className="text-lg">{clip.title}</DialogTitle>
        <DialogDescription className="font-mono text-xs tabular-nums">
          {formatDuration(clip.startMs)}–{formatDuration(clip.endMs)} ·{" "}
          {Math.round((clip.endMs - clip.startMs) / 1000)} s · score{" "}
          {clip.score.toFixed(2)}
        </DialogDescription>
      </DialogHeader>
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
          variant={clip.status === "approved" ? "primary" : "default"}
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
        {render && <PublishControl clip={clip} publishing={publishing} />}
      </div>
      {publication &&
        (publication.status === "published" ||
          publication.status === "removed") && (
          <ClipStats publication={publication} />
        )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <Button size="sm" disabled={position <= 1} onClick={() => onMove(-1)}>
          <CaretLeftIcon data-icon="inline-start" aria-hidden />
          Previous
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {position} / {total}
        </span>
        <Button
          size="sm"
          disabled={position >= total}
          onClick={() => onMove(1)}
        >
          Next
          <CaretRightIcon data-icon="inline-end" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
