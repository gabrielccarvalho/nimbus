"use client"

import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react"
import * as React from "react"

import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useVideoPlayer } from "@/components/ui/video-player"
import { formatTimestamp } from "@/lib/format"

import { IconAction } from "./icon-action"

const END_SLACK_MS = 50

export function ClipPlayback({
  startMs,
  endMs,
  loop,
}: {
  startMs: number
  endMs: number
  loop: boolean
}) {
  const { currentMs, paused, seek, pause } = useVideoPlayer()
  React.useEffect(() => {
    if (currentMs < startMs - 250) seek(startMs)
    else if (currentMs >= endMs) {
      if (loop) seek(startMs)
      else if (!paused) {
        pause()
        seek(endMs)
      } else if (currentMs > endMs) seek(endMs)
    }
  }, [currentMs, paused, startMs, endMs, loop, seek, pause])
  return null
}

export function useClipTransport(startMs: number, endMs: number) {
  const player = useVideoPlayer()
  const toggle = () => {
    if (player.paused && player.currentMs >= endMs - END_SLACK_MS)
      player.seek(startMs)
    player.toggle()
  }
  const step = (deltaMs: number) =>
    player.seek(Math.min(endMs, Math.max(startMs, player.currentMs + deltaMs)))
  return { ...player, toggle, step }
}

export function ClipTransport({
  startMs,
  endMs,
  loop,
  onLoopChange,
}: {
  startMs: number
  endMs: number
  loop: boolean
  onLoopChange: (loop: boolean) => void
}) {
  const { currentMs, paused, muted, setMuted, toggle, step } = useClipTransport(
    startMs,
    endMs
  )
  const label = paused ? "Play" : "Pause"

  return (
    <div
      role="group"
      aria-label="Playback"
      className="flex shrink-0 items-center justify-center gap-1.5"
    >
      <span className="min-w-[120px] text-right font-mono text-[13px] tabular-nums">
        {formatTimestamp(
          Math.min(endMs, Math.max(startMs, currentMs)) - startMs
        )}{" "}
        <span className="text-tertiary">
          / {formatTimestamp(endMs - startMs)}
        </span>
      </span>
      <IconAction label="Back 1 second" onClick={() => step(-1000)}>
        <CaretDoubleLeftIcon aria-hidden />
      </IconAction>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`${label} (Space)`}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-primary-foreground transition-transform duration-[250ms] ease-snappy active:scale-[.97] [&_svg]:size-4"
              onClick={toggle}
            />
          }
        >
          {paused ? (
            <PlayIcon weight="fill" aria-hidden />
          ) : (
            <PauseIcon weight="fill" aria-hidden />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {label}
          <Kbd>Space</Kbd>
        </TooltipContent>
      </Tooltip>
      <IconAction label="Forward 1 second" onClick={() => step(1000)}>
        <CaretDoubleRightIcon aria-hidden />
      </IconAction>
      <span className="flex min-w-[120px] items-center gap-1">
        <IconAction
          label="Loop clip"
          aria-pressed={loop}
          className="aria-pressed:text-foreground"
          onClick={() => onLoopChange(!loop)}
        >
          <RepeatIcon aria-hidden />
        </IconAction>
        <IconAction
          label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => setMuted(!muted)}
        >
          {muted ? (
            <SpeakerSlashIcon aria-hidden />
          ) : (
            <SpeakerHighIcon aria-hidden />
          )}
        </IconAction>
      </span>
    </div>
  )
}
