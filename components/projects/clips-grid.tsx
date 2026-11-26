"use client"

import { CheckIcon, XIcon } from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { DotMeter } from "@/components/ui/dot-meter"
import type { Clip } from "@/features/clips/repository"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ClipPlayerDialog,
  currentRender,
  useClipStatus,
  type ClipPlayerData,
  type RenderLinks,
} from "./clip-player-dialog"
import { PublicationStatusView, type PublicationState } from "./publish-dialog"
import { clipStatusLabel } from "./status-badge"

function ClipTile({
  projectId,
  clip,
  rank,
  src,
  render,
  publication,
  caption,
  playing,
  onHoverChange,
  onOpen,
}: {
  projectId: string
  clip: Clip
  rank: number
  src: string
  render?: RenderLinks
  publication?: PublicationState
  caption: string
  playing: boolean
  onHoverChange: (hovered: boolean) => void
  onOpen: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const id = React.useId()
  const { pending, setStatus } = useClipStatus(projectId, clip)
  const approved = ["approved", "rendering", "rendered"].includes(clip.status)
  const rejected = clip.status === "rejected"
  const locked = clip.status === "rendering" || clip.status === "rendered"

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !render) return
    if (playing) {
      video.currentTime = 0
      video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
  }, [playing, render])

  return (
    <li
      data-status={clip.status}
      className="group/clip grid min-w-0 gap-2.5"
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        if (event.target instanceof HTMLInputElement) return
        const key = event.key.toLowerCase()
        if (locked && (key === "a" || key === "x")) return
        if (key === "a") setStatus(approved ? "candidate" : "approved")
        else if (key === "x") setStatus(rejected ? "candidate" : "rejected")
        else return
        event.preventDefault()
      }}
    >
      <div className="relative transition-opacity group-data-[status=rejected]/clip:opacity-42">
        <button
          type="button"
          data-clip-id={clip.id}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-status ${id}-meta`}
          className="relative block aspect-[9/16] w-full overflow-hidden rounded-[14px] bg-graphite-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav"
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
            className="absolute inset-0 -z-0 size-full object-cover"
          />
        </button>
        <span
          aria-hidden
          className="pointer-events-none absolute start-2 top-2 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold backdrop-blur-sm"
        >
          #{rank}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute end-2 top-2 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold backdrop-blur-sm"
        >
          {formatDuration(clip.endMs - clip.startMs)}
        </span>
        {caption && !render && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-[22%] text-center text-[13px] leading-tight font-extrabold text-balance text-white uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
          >
            {caption}
          </span>
        )}
        {approved && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[14px] inset-ring-2 inset-ring-mint"
          />
        )}
        {approved && (
          <span
            aria-hidden
            className="pointer-events-none absolute end-2 bottom-2 grid size-[26px] place-items-center rounded-full bg-mint text-night"
          >
            <CheckIcon weight="bold" className="size-3.5" />
          </span>
        )}
      </div>
      <div className="grid gap-1.5 px-0.5">
        <span
          id={`${id}-title`}
          className="line-clamp-2 text-sm leading-snug font-medium group-data-[status=rejected]/clip:text-muted-foreground"
        >
          {clip.title}
        </span>
        <span id={`${id}-status`} className="sr-only">
          {clipStatusLabel(clip.status)}
        </span>
        <span
          id={`${id}-meta`}
          className="flex items-center gap-2 text-xs text-tertiary"
        >
          <DotMeter
            value={Math.round(clip.score * 10)}
            max={10}
            aria-label={`Score ${Math.round(clip.score * 100)}`}
          />
          <span className="font-mono tabular-nums">
            {formatDuration(clip.startMs)}
          </span>
        </span>
        {publication && publication.status !== "removed" && (
          <PublicationStatusView publication={publication} />
        )}
        <div className="mt-0.5 flex gap-1.5">
          <Button
            size="sm"
            variant={approved ? "primary" : "default"}
            aria-pressed={approved}
            disabled={pending || locked}
            onClick={() => setStatus(approved ? "candidate" : "approved")}
            className="flex-1"
          >
            <CheckIcon data-icon="inline-start" aria-hidden />
            {clip.status === "rendered"
              ? "Rendered"
              : clip.status === "rendering"
                ? "Rendering"
                : approved
                  ? "Approved"
                  : "Approve"}
          </Button>
          <Button
            size="sm"
            aria-pressed={rejected}
            aria-label={rejected ? "Restore clip" : "Reject clip"}
            disabled={pending || locked}
            onClick={() => setStatus(rejected ? "candidate" : "rejected")}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  )
}

export function ClipsGrid({
  clips,
  ranks,
  openClipId,
  onOpenClipIdChange,
  className,
  ...data
}: ClipPlayerData & {
  clips: Clip[]
  ranks?: Record<string, number>
  openClipId?: string | null
  onOpenClipIdChange?: (id: string | null) => void
  className?: string
}) {
  const [openState, setOpenState] = React.useState<string | null>(null)
  const openId = openClipId === undefined ? openState : openClipId
  const [shownId, setShownId] = React.useState(openId)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLOListElement>(null)

  if (openId && openId !== shownId) setShownId(openId)

  const setOpenId = (id: string | null) => {
    if (openClipId === undefined) setOpenState(id)
    onOpenClipIdChange?.(id)
  }
  const index = clips.findIndex((clip) => clip.id === shownId)
  const open = Boolean(openId) && index >= 0

  const moveFocus = (event: React.KeyboardEvent<HTMLOListElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step === undefined || !(event.target instanceof HTMLElement)) return
    const tiles = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-clip-id]") ?? []
    )
    const current = tiles.findIndex((tile) =>
      tile.closest("li")?.contains(event.target as Node)
    )
    const next = tiles[current + step]
    if (current < 0 || !next) return
    event.preventDefault()
    next.focus()
  }

  return (
    <>
      <ol
        ref={listRef}
        aria-label="Clips"
        tabIndex={-1}
        onKeyDown={moveFocus}
        className={cn(
          "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[18px] outline-none",
          className
        )}
      >
        {clips.map((clip, i) => (
          <ClipTile
            key={clip.id}
            projectId={data.projectId}
            clip={clip}
            rank={ranks?.[clip.id] ?? i + 1}
            src={data.src}
            render={currentRender(clip, data.renders)}
            publication={data.publishing.publications[clip.id]}
            caption={
              data.captions[clip.id]?.enabled
                ? (data.captions[clip.id]?.pages[0]?.words
                    .map((w) => w.text)
                    .join(" ") ?? "")
                : ""
            }
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
        finalFocus={() =>
          listRef.current?.querySelector<HTMLElement>(
            `[data-clip-id="${shownId}"]`
          ) ?? listRef.current
        }
        {...data}
      />
    </>
  )
}
