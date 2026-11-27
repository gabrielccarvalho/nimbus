"use client"

import {
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { ui } from "@/components/ui/messages"
import { Slider } from "@/components/ui/slider"
import { useMessages } from "@/lib/i18n/client"
import {
  partIndexAt,
  partsRange,
  partStarts,
  toSourceMs,
} from "@/features/clips/parts"

type Part = { startMs: number; endMs: number }

// Jumping this early hides the frame after a part's end, which would
// otherwise show for one paint before the seek lands.
const PART_END_LEAD_MS = 30

type VideoPlayerContextValue = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  currentMs: number
  durationMs: number
  paused: boolean
  muted: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (ms: number) => void
  setMuted: (muted: boolean) => void
  sync: () => void
  now: () => number
}

const VideoPlayerContext = React.createContext<VideoPlayerContextValue | null>(
  null
)

function useVideoPlayer() {
  const context = React.useContext(VideoPlayerContext)
  if (!context) {
    throw new Error("useVideoPlayer must be used within <VideoPlayer>")
  }
  return context
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

const videoPlayerVariants = cva(
  "group/video-player relative flex flex-col overflow-hidden rounded-xl bg-black text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
  {
    variants: {
      aspect: {
        video: "[&_[data-slot=video-player-video]]:aspect-video",
        vertical: "[&_[data-slot=video-player-video]]:aspect-[9/16]",
        auto: "",
      },
    },
    defaultVariants: { aspect: "video" },
  }
)

type VideoPlayerProviderProps = {
  muted?: boolean
  defaultMuted?: boolean
  onMutedChange?: (muted: boolean) => void
  onTimeUpdate?: (ms: number) => void
  parts?: readonly Part[]
  children?: React.ReactNode
}

function VideoPlayerProvider({
  muted: mutedProp,
  defaultMuted = false,
  onMutedChange,
  onTimeUpdate,
  parts,
  children,
}: VideoPlayerProviderProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [currentMs, setCurrentMs] = React.useState(0)
  const [durationMs, setDurationMs] = React.useState(0)
  const [paused, setPaused] = React.useState(true)
  const [mutedState, setMutedState] = React.useState(defaultMuted)
  const muted = mutedProp ?? mutedState
  const onTimeUpdateRef = React.useRef(onTimeUpdate)

  React.useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate
  })

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  const joined = parts && parts.length > 1 ? parts : undefined
  const joinedRef = React.useRef(joined)
  const partRef = React.useRef(0)

  const now = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return 0
    const mediaMs = Math.round(video.currentTime * 1000)
    const list = joinedRef.current
    if (!list) return mediaMs
    let index = Math.min(partRef.current, list.length - 1)
    const last = list.length - 1
    if (
      index < last &&
      !video.paused &&
      mediaMs >= list[index]!.endMs - PART_END_LEAD_MS
    ) {
      index += 1
      partRef.current = index
      video.currentTime = list[index]!.startMs / 1000
      return partStarts(list)[index]!
    }
    const part = list[index]!
    const offset = mediaMs - part.startMs
    return (
      partStarts(list)[index]! +
      Math.min(
        index === 0 ? offset : Math.max(0, offset),
        index === last ? Infinity : part.endMs - part.startMs
      )
    )
  }, [])

  const sync = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const ms = now()
    setCurrentMs(ms)
    setPaused(video.paused)
    if (Number.isFinite(video.duration)) {
      const list = joinedRef.current
      const mediaMs = Math.round(video.duration * 1000)
      setDurationMs(
        list ? partsRange(list).endMs + mediaMs - list.at(-1)!.endMs : mediaMs
      )
    }
    onTimeUpdateRef.current?.(ms)
  }, [now])

  const partsKey = JSON.stringify(joined ?? null)
  React.useEffect(() => {
    const list = JSON.parse(partsKey) as Part[] | null
    joinedRef.current = list ?? undefined
    const video = videoRef.current
    if (list && video) {
      const mediaMs = Math.round(video.currentTime * 1000)
      const inside = list.findIndex(
        (part) => mediaMs >= part.startMs && mediaMs < part.endMs
      )
      partRef.current =
        inside !== -1
          ? inside
          : mediaMs < list[0]!.startMs
            ? 0
            : list.length - 1
    } else {
      partRef.current = 0
    }
    sync()
  }, [partsKey, sync])

  React.useEffect(() => {
    if (paused) return
    let frame = requestAnimationFrame(function loop() {
      sync()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [paused, sync])

  const value = React.useMemo<VideoPlayerContextValue>(
    () => ({
      videoRef,
      currentMs,
      durationMs,
      paused,
      muted,
      play: () => void videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      toggle: () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) void video.play().catch(() => {})
        else video.pause()
      },
      seek: (ms) => {
        const video = videoRef.current
        if (!video) return
        const max = Number.isFinite(video.duration) ? video.duration : Infinity
        const list = joinedRef.current
        if (list) partRef.current = partIndexAt(list, ms)
        const mediaMs = list ? toSourceMs(list, ms) : ms
        video.currentTime = Math.min(max, Math.max(0, mediaMs / 1000))
        sync()
      },
      setMuted: (next) => {
        if (mutedProp === undefined) setMutedState(next)
        onMutedChange?.(next)
      },
      sync,
      now,
    }),
    [currentMs, durationMs, paused, muted, mutedProp, onMutedChange, sync, now]
  )

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  )
}

function VideoPlayerFrame({
  className,
  aspect = "video",
  onKeyDown,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof videoPlayerVariants>) {
  const player = useVideoPlayer()
  return (
    <div
      data-slot="video-player"
      data-state={player.paused ? "paused" : "playing"}
      role="group"
      tabIndex={0}
      className={cn(videoPlayerVariants({ aspect }), className)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.target !== event.currentTarget) {
          return
        }
        const step = event.shiftKey ? 5000 : 1000
        const keys: Record<string, () => void> = {
          " ": player.toggle,
          k: player.toggle,
          m: () => player.setMuted(!player.muted),
          ArrowLeft: () => player.seek(player.currentMs - step),
          ArrowRight: () => player.seek(player.currentMs + step),
          j: () => player.seek(player.currentMs - 5000),
          l: () => player.seek(player.currentMs + 5000),
        }
        const action = keys[event.key]
        if (!action) return
        event.preventDefault()
        action()
      }}
      {...props}
    />
  )
}

function VideoPlayer({
  muted,
  defaultMuted,
  onMutedChange,
  onTimeUpdate,
  ...props
}: Omit<React.ComponentProps<"div">, "onTimeUpdate"> &
  VariantProps<typeof videoPlayerVariants> &
  Omit<VideoPlayerProviderProps, "children">) {
  const context = React.useContext(VideoPlayerContext)
  if (context) return <VideoPlayerFrame {...props} />
  return (
    <VideoPlayerProvider
      muted={muted}
      defaultMuted={defaultMuted}
      onMutedChange={onMutedChange}
      onTimeUpdate={onTimeUpdate}
    >
      <VideoPlayerFrame {...props} />
    </VideoPlayerProvider>
  )
}

function VideoPlayerVideo({
  className,
  onLoadedMetadata,
  onPlay,
  onPause,
  onSeeked,
  onTimeUpdate,
  onEnded,
  ...props
}: React.ComponentProps<"video">) {
  const { videoRef, sync, toggle } = useVideoPlayer()
  const handle =
    <E,>(handler?: (event: E) => void) =>
    (event: E) => {
      handler?.(event)
      sync()
    }
  return (
    <video
      ref={videoRef}
      data-slot="video-player-video"
      playsInline
      crossOrigin="anonymous"
      preload="metadata"
      className={cn("block w-full bg-black object-contain", className)}
      onClick={toggle}
      onLoadedMetadata={handle(onLoadedMetadata)}
      onPlay={handle(onPlay)}
      onPause={handle(onPause)}
      onSeeked={handle(onSeeked)}
      onTimeUpdate={handle(onTimeUpdate)}
      onEnded={handle(onEnded)}
      {...props}
    />
  )
}

function VideoPlayerControls({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="video-player-controls"
      className={cn(
        "flex items-center gap-2 bg-black/80 px-2 py-1.5 text-xs text-white",
        className
      )}
      {...props}
    />
  )
}

function VideoPlayerPlayButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { paused, toggle } = useVideoPlayer()
  const t = useMessages(ui).videoPlayer
  return (
    <Button
      data-slot="video-player-play-button"
      variant="ghost"
      size="icon-sm"
      aria-label={paused ? t.play : t.pause}
      className={cn("text-white hover:bg-white/15 hover:text-white", className)}
      onClick={toggle}
      {...props}
    >
      {paused ? <PlayIcon weight="fill" /> : <PauseIcon weight="fill" />}
    </Button>
  )
}

function VideoPlayerMuteButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { muted, setMuted } = useVideoPlayer()
  const t = useMessages(ui).videoPlayer
  return (
    <Button
      data-slot="video-player-mute-button"
      variant="ghost"
      size="icon-sm"
      aria-label={muted ? t.unmute : t.mute}
      aria-pressed={muted}
      className={cn("text-white hover:bg-white/15 hover:text-white", className)}
      onClick={() => setMuted(!muted)}
      {...props}
    >
      {muted ? <SpeakerSlashIcon /> : <SpeakerHighIcon />}
    </Button>
  )
}

function VideoPlayerSeekBar({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof Slider>,
  "value" | "defaultValue" | "onValueChange" | "min" | "max"
>) {
  const { currentMs, durationMs, seek } = useVideoPlayer()
  const labelId = React.useId()
  const t = useMessages(ui).videoPlayer
  return (
    <>
      <span id={labelId} hidden>
        {t.seek}
      </span>
      <Slider
        data-slot="video-player-seek-bar"
        aria-labelledby={labelId}
        min={0}
        max={Math.max(durationMs, 1) / 1000}
        step={0.1}
        value={[currentMs / 1000]}
        disabled={!durationMs}
        format={{ style: "unit", unit: "second", maximumFractionDigits: 1 }}
        onValueChange={(value) => {
          const seconds = Array.isArray(value) ? value[0] : value
          if (seconds !== undefined) seek(seconds * 1000)
        }}
        className={cn("flex-1", className)}
        {...props}
      />
    </>
  )
}

function VideoPlayerTime({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { currentMs, durationMs } = useVideoPlayer()
  return (
    <span
      data-slot="video-player-time"
      className={cn("shrink-0 font-mono tabular-nums", className)}
      {...props}
    >
      {formatTime(currentMs)} / {formatTime(durationMs)}
    </span>
  )
}

export {
  useVideoPlayer,
  VideoPlayer,
  VideoPlayerProvider,
  VideoPlayerControls,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerSeekBar,
  VideoPlayerTime,
  VideoPlayerVideo,
  videoPlayerVariants,
}
