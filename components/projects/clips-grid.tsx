"use client"

import * as React from "react"

import type { Clip } from "@/features/clips/repository"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ClipPlayerDialog,
  currentRender,
  type ClipPlayerData,
  type RenderLinks,
} from "./clip-player-dialog"
import { ClipStatusBadge } from "./status-badge"

function ClipTile({
  clip,
  src,
  render,
  playing,
  onHoverChange,
  onOpen,
}: {
  clip: Clip
  src: string
  render?: RenderLinks
  playing: boolean
  onHoverChange: (hovered: boolean) => void
  onOpen: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const id = React.useId()

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !render) return
    if (playing) {
      video.currentTime = 0
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [playing, render])

  return (
    <li className="min-w-0">
      <button
        type="button"
        data-status={clip.status}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-status ${id}-meta`}
        className="relative flex aspect-[9/16] w-full flex-col justify-end overflow-hidden rounded-xl bg-muted text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=rejected]:opacity-60"
        onClick={onOpen}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onHoverChange(true)
        }}
        onPointerLeave={() => onHoverChange(false)}
      >
        <video
          ref={videoRef}
          aria-hidden
          muted
          loop
          playsInline
          preload="metadata"
          src={render?.url ?? `${src}#t=${(clip.startMs / 1000).toFixed(1)}`}
          className="absolute inset-0 size-full object-cover"
        />
        <span className="relative flex flex-col items-start gap-1 bg-linear-to-t from-black/80 to-transparent p-2 pt-10 text-white">
          <span id={`${id}-status`}>
            <ClipStatusBadge status={clip.status} />
          </span>
          <span id={`${id}-title`} className="line-clamp-2 text-sm font-medium">
            {clip.title}
          </span>
          <span
            id={`${id}-meta`}
            className="font-mono text-xs text-white/70 tabular-nums"
          >
            {formatDuration(clip.endMs - clip.startMs)} · score{" "}
            {clip.score.toFixed(2)}
          </span>
        </span>
      </button>
    </li>
  )
}

export function ClipsGrid({
  clips,
  openClipId,
  onOpenClipIdChange,
  className,
  ...data
}: ClipPlayerData & {
  clips: Clip[]
  openClipId?: string | null
  onOpenClipIdChange?: (id: string | null) => void
  className?: string
}) {
  const [openState, setOpenState] = React.useState<string | null>(null)
  const openId = openClipId === undefined ? openState : openClipId
  const [shownId, setShownId] = React.useState(openId)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)

  if (openId && openId !== shownId) setShownId(openId)

  const setOpenId = (id: string | null) => {
    if (openClipId === undefined) setOpenState(id)
    onOpenClipIdChange?.(id)
  }
  const index = clips.findIndex((clip) => clip.id === shownId)
  const open = Boolean(openId) && index >= 0

  return (
    <>
      <ol
        aria-label="Clips"
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
          className
        )}
      >
        {clips.map((clip) => (
          <ClipTile
            key={clip.id}
            clip={clip}
            src={data.src}
            render={currentRender(clip, data.renders)}
            playing={hoveredId === clip.id && !open}
            onHoverChange={(hovered) =>
              setHoveredId((current) =>
                hovered ? clip.id : current === clip.id ? null : current
              )
            }
            onOpen={() => setOpenId(clip.id)}
          />
        ))}
      </ol>
      <ClipPlayerDialog
        open={open}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
        clips={clips}
        index={Math.max(0, index)}
        onIndexChange={(next) => setOpenId(clips[next]?.id ?? null)}
        {...data}
      />
    </>
  )
}
