"use client"

import {
  ArrowCounterClockwiseIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  ClosedCaptioningIcon,
  DotsSixIcon,
  EyeIcon,
  EyeSlashIcon,
  FilmStripIcon,
  MagicWandIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MusicNotesIcon,
  PlusIcon,
  ScissorsIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TextTIcon,
  TrashIcon,
  XIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react"
import { cn } from "cn"
import * as React from "react"
import { toast } from "sonner"

import { MusicUploadButton } from "@/components/music/music-upload-button"
import { TrackPicker } from "@/components/music/track-picker"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { TimelineBlock, TimelineTrack } from "@/components/ui/timeline-track"
import type { Tone } from "@/components/ui/tone"
import { useVideoPlayer } from "@/components/ui/video-player"
import { Waveform } from "@/components/ui/waveform"
import {
  DEFAULT_OVERLAY_MS,
  defaultOverlayText,
  MAX_TEXT_LANES,
  MIN_OVERLAY_MS,
  type TextOverlay,
} from "@/features/captions/overlay"
import type { CaptionPage } from "@/features/captions/pages"
import { CAPTION_BASELINE_RANGE } from "@/features/captions/styles"
import {
  CLIP_MAX_EDIT_MS,
  CLIP_MIN_EDIT_MS,
  MAX_CAPTION_LANES,
} from "@/features/clips/schema"
import {
  MAX_EFFECT_LANES,
  MIN_EFFECT_MS,
  type ClipEffects,
  type Effect,
} from "@/features/effects/schema"
import {
  MAX_MUSIC_LANES,
  MIN_MUSIC_MS,
  newMusicClip,
  type AudioMix,
  type MusicClip,
  type MusicTrackSummary,
  type ReadyMusicTrack,
  type TrendingMusic,
  youtubeWatchUrl,
} from "@/features/music/schema"
import type { SourceLoudness } from "@/features/projects/queries"
import {
  addCaption,
  captionBlocks,
  deleteCaption,
  findCaption,
  moveCaption,
  setCaptionText,
  MIN_CAPTION_MS,
  type CaptionRef,
  type CaptionState,
} from "@/features/timeline/captions"
import {
  laneCount,
  moveItem,
  placeAtPlayhead,
  type Laned,
  type Span,
} from "@/features/timeline/lanes"
import { retimeMusic } from "@/features/timeline/music"
import { splitCaption, splitItem, splitMusic } from "@/features/timeline/split"
import { formatTimestamp } from "@/lib/format"

import { START_SLACK_MS } from "./clip-transport"
import { IconAction } from "./icon-action"
import {
  CaptionInspector,
  EffectInspector,
  effectLabel,
  MusicInspector,
  SourceInspector,
  TextInspector,
  VideoInspector,
} from "./timeline-inspector"
import { useClipHotkeys } from "./use-clip-hotkeys"

export type TimelineSelection =
  | { type: "video" }
  | { type: "source" }
  | { type: "effect"; index: number }
  | { type: "caption"; ref: CaptionRef }
  | { type: "text"; index: number }
  | { type: "music"; index: number }

type LaneGroup = "effects" | "texts" | "music"

const ZOOM_FIT = 0
const ZOOM_MIN = 5
const ZOOM_MAX = 320
const DEFAULT_ZOOM = 80
const WHEEL_ZOOM = 0.0025
const WHEEL_LINE_PX = 16
const VIEW_GUTTER_PX = 32
const VIEW_STEP = 0.1
const VIEW_GRIP_PX = 44
const VIEW_ZOOM_MAX_PERCENT = 50
const AXIS_PADDING_MS = 10_000
const TICK_STEPS_MS = [500, 1000, 2000, 5000, 10_000, 30_000, 60_000]
const MIN_TICK_PX = 64
const LANE_BASELINE_STEP = 0.15
const LEVEL_FLOOR_DB = -40
const THUMB_WIDTH = 96
const THUMB_HEIGHT = 54
const THUMB_STEPS_MS = [2000, 5000, 10_000]
const MAX_THUMBS = 40

export const EFFECT_KINDS = [
  { key: "cam", label: "Full cam", lengthMs: 2000 },
  { key: "game", label: "Full game", lengthMs: 2000 },
  { key: "zoom", label: "Zoom", lengthMs: 1500 },
  { key: "shake", label: "Shake", lengthMs: 500 },
] as const

type EffectKey = (typeof EFFECT_KINDS)[number]["key"]

function createEffect(key: EffectKey, placed: Laned): Effect {
  if (key === "zoom") {
    return { kind: "zoom", ...placed, scale: 1.4, focus: { x: 0.5, y: 0.5 } }
  }
  if (key === "shake") return { kind: "shake", ...placed, intensity: "light" }
  return { kind: "focus", ...placed, target: key }
}

export function effectTone(effect: Effect): Tone {
  if (effect.kind === "zoom") return "lav"
  if (effect.kind === "shake") return "pink"
  return effect.target === "game" ? "sky" : "amber"
}

export function effectText(effect: Effect) {
  if (effect.kind === "zoom") return `Zoom ${effect.scale}×`
  if (effect.kind === "shake") return `Shake ${effect.intensity}`
  return effectLabel(effect)
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const level = (db: number) => Math.max(0, 1 - db / LEVEL_FLOOR_DB)

const formatTick = (ms: number) =>
  ms < 0 ? `−${formatTimestamp(-ms)}` : formatTimestamp(ms)

export function rulerTicks(
  fromMs: number,
  toMs: number,
  widthPx: number
): number[] {
  const spanMs = toMs - fromMs
  if (spanMs <= 0 || widthPx <= 0) return []
  const pxPerMs = widthPx / spanMs
  const step =
    TICK_STEPS_MS.find((ms) => ms * pxPerMs >= MIN_TICK_PX) ??
    TICK_STEPS_MS.at(-1)!
  const first = Math.ceil(fromMs / step)
  const last = Math.floor(toMs / step)
  return Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step)
}

function peaksFor(track: ReadyMusicTrack, clip: MusicClip) {
  const count = track.peaks.length
  if (count === 0 || track.durationMs <= 0) return []
  const from = Math.floor((clip.inMs / track.durationMs) * count)
  const to = Math.ceil(
    ((clip.inMs + clip.endMs - clip.startMs) / track.durationMs) * count
  )
  return track.peaks.slice(from, Math.max(from + 1, to))
}

function loudnessFor(loudness: SourceLoudness | null, span: Span) {
  if (!loudness) return null
  const { fromMs, intervalMs, values } = loudness
  const from = clamp(
    Math.floor((span.startMs - fromMs) / intervalMs),
    0,
    values.length
  )
  const to = clamp(
    Math.ceil((span.endMs - fromMs) / intervalMs),
    from,
    values.length
  )
  if (to === from) return null
  return {
    values: values.slice(from, to),
    startMs: fromMs + from * intervalMs,
    endMs: fromMs + to * intervalMs,
  }
}

function nextBaseline(current: readonly number[], first: number) {
  const direction = first > 0.5 ? -1 : 1
  for (let step = 1; step <= MAX_CAPTION_LANES; step++) {
    const candidate = clamp(
      first + direction * step * LANE_BASELINE_STEP,
      CAPTION_BASELINE_RANGE.min,
      CAPTION_BASELINE_RANGE.max
    )
    if (!current.some((b) => Math.abs(b - candidate) < 0.05))
      return Math.round(candidate * 100) / 100
  }
  return first
}

// Workaround: reads Base UI's internal data-tabindex, where it parks a portaled
// popup's tab stops. Proper fix: make the selected block a real Popover trigger.
function tabIndexOf(element: HTMLElement) {
  const original = element.getAttribute("data-tabindex")
  if (original === null) return element.tabIndex
  return original === "" ? 0 : Number(original)
}

function tabbables(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>("button, input, [tabindex]") ?? []
  ).filter(
    (element) => tabIndexOf(element) >= 0 && !element.matches(":disabled")
  )
}

function thumbTiles(fromMs: number, toMs: number) {
  const step =
    THUMB_STEPS_MS.find((ms) => (toMs - fromMs) / ms <= MAX_THUMBS) ??
    THUMB_STEPS_MS.at(-1)!
  const first = Math.floor(fromMs / step)
  const last = Math.ceil(toMs / step)
  return Array.from({ length: Math.max(0, last - first) }, (_, i) => {
    const atMs = (first + i) * step
    return {
      atMs,
      sampleMs: atMs + step / 2,
      lengthMs: Math.min(toMs, atMs + step) - Math.max(fromMs, atMs),
    }
  })
}

function useThumbnails(
  src: string,
  tiles: readonly { atMs: number; sampleMs: number }[]
) {
  const [frames, setFrames] = React.useState<ReadonlyMap<number, string>>(
    () => new Map()
  )
  const known = React.useRef(new Set<number>())
  const wanted = React.useRef(tiles)
  React.useEffect(() => {
    wanted.current = tiles
  })
  const key = tiles.map((tile) => tile.atMs).join(",")

  React.useEffect(() => {
    const queue = wanted.current.filter((tile) => !known.current.has(tile.atMs))
    if (queue.length === 0) return
    const video = document.createElement("video")
    video.muted = true
    video.preload = "auto"
    video.playsInline = true
    video.crossOrigin = "anonymous"
    const canvas = document.createElement("canvas")
    canvas.width = THUMB_WIDTH
    canvas.height = THUMB_HEIGHT
    let current: (typeof queue)[number] | undefined
    const next = () => {
      current = queue.shift()
      if (current) video.currentTime = current.sampleMs / 1000
    }
    const capture = () => {
      const tile = current
      if (!tile) return
      try {
        const context = canvas.getContext("2d")
        if (!context) return
        context.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
        const url = canvas.toDataURL("image/jpeg", 0.6)
        known.current.add(tile.atMs)
        setFrames((frames) => new Map(frames).set(tile.atMs, url))
      } catch {
        return
      }
      next()
    }
    video.addEventListener("loadedmetadata", next, { once: true })
    video.addEventListener("seeked", capture)
    video.src = src
    return () => {
      video.removeEventListener("loadedmetadata", next)
      video.removeEventListener("seeked", capture)
      video.removeAttribute("src")
      if (video.networkState !== HTMLMediaElement.NETWORK_EMPTY) video.load()
    }
  }, [src, key])

  return frames
}

const LANE = "relative h-[34px]"
const TRACK = "h-full overflow-visible rounded-none bg-transparent"

function TrackLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex h-[34px] items-center gap-[7px] ps-3.5 pe-1.5 text-xs text-tertiary [&_svg]:size-[13px] [&_svg]:shrink-0",
        className
      )}
    >
      {children}
    </div>
  )
}

function LabelToggle({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "-mx-[3.5px] grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200 outline-none hover:bg-glass hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-45",
        className
      )}
      {...props}
    />
  )
}

function ClipSpan({
  leadMs,
  durationMs,
  axisMs,
  className,
  children,
}: {
  leadMs: number
  durationMs: number
  axisMs: number
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn("absolute inset-y-0", className)}
      style={{
        left: `${(leadMs / axisMs) * 100}%`,
        width: `${(durationMs / axisMs) * 100}%`,
      }}
    >
      {children}
    </div>
  )
}

function Outside({
  fromMs,
  toMs,
  axisMs,
  className,
}: {
  fromMs: number
  toMs: number
  axisMs: number
  className: string
}) {
  if (toMs <= fromMs) return null
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        left: `${(fromMs / axisMs) * 100}%`,
        width: `${((toMs - fromMs) / axisMs) * 100}%`,
      }}
    />
  )
}

type View = { start: number; size: number }

function ViewHandle({
  view,
  zoomLevel,
  scrollRef,
  controls,
}: {
  view: View
  zoomLevel: number
  scrollRef: React.RefObject<HTMLDivElement | null>
  controls: string
}) {
  const drag = React.useRef<{ x: number; scrollLeft: number } | null>(null)
  const hidden = 1 - view.size
  const progress = hidden > 0.001 ? clamp(view.start / hidden, 0, 1) : 0
  const zoomPx = VIEW_GRIP_PX * (1 - zoomLevel)
  const zoomPercent = VIEW_ZOOM_MAX_PERCENT * zoomLevel
  const panBy = (pages: number) => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollLeft += pages * scroller.clientWidth
  }

  return (
    <div
      data-slot="timeline-view"
      className="relative h-[18px] shrink-0 touch-none"
      onPointerDown={(event) => {
        const scroller = scrollRef.current
        if (event.button !== 0 || event.target !== event.currentTarget) return
        if (!scroller) return
        const rect = event.currentTarget.getBoundingClientRect()
        const travel = rect.width - VIEW_GRIP_PX
        if (travel <= 0) return
        scroller.scrollLeft =
          clamp((event.clientX - rect.left - VIEW_GRIP_PX / 2) / travel, 0, 1) *
          (scroller.scrollWidth - scroller.clientWidth)
      }}
    >
      {hidden > 0.001 && (
        <span
          aria-hidden
          data-slot="timeline-zoom-level"
          className="pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/15"
          style={{
            width: `calc(${zoomPercent}% + ${zoomPx}px)`,
            left: `calc(${progress * (100 - zoomPercent)}% - ${progress * zoomPx}px)`,
          }}
        />
      )}
      {hidden > 0.001 && (
        <div
          role="scrollbar"
          aria-label="Timeline position"
          aria-controls={controls}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          className="absolute inset-y-0.5 grid cursor-grab place-items-center rounded-md bg-white/25 text-night/80 transition-colors duration-200 outline-none hover:bg-white/45 focus-visible:focus-ring active:cursor-grabbing active:bg-white/60"
          style={{
            width: VIEW_GRIP_PX,
            left: `calc(${progress} * (100% - ${VIEW_GRIP_PX}px))`,
          }}
          onPointerDown={(event) => {
            const scroller = scrollRef.current
            if (event.button !== 0 || !scroller) return
            event.currentTarget.setPointerCapture?.(event.pointerId)
            drag.current = {
              x: event.clientX,
              scrollLeft: scroller.scrollLeft,
            }
          }}
          onPointerMove={(event) => {
            const scroller = scrollRef.current
            const track = event.currentTarget.parentElement
            if (!drag.current || !scroller || !track) return
            const travel =
              track.getBoundingClientRect().width -
              event.currentTarget.getBoundingClientRect().width
            if (travel <= 0) return
            scroller.scrollLeft =
              drag.current.scrollLeft +
              ((event.clientX - drag.current.x) / travel) *
                (scroller.scrollWidth - scroller.clientWidth)
          }}
          onPointerUp={() => {
            drag.current = null
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
          onKeyDown={(event) => {
            const scroller = scrollRef.current
            if (!scroller) return
            if (event.key === "ArrowLeft") panBy(-VIEW_STEP)
            else if (event.key === "ArrowRight") panBy(VIEW_STEP)
            else if (event.key === "Home") scroller.scrollLeft = 0
            else if (event.key === "End")
              scroller.scrollLeft = scroller.scrollWidth
            else return
            event.preventDefault()
          }}
        >
          <DotsSixIcon weight="bold" aria-hidden className="size-3.5" />
        </div>
      )}
    </div>
  )
}

export function ClipTimeline({
  src,
  sourceDurationMs,
  startMs,
  endMs,
  onTrim,
  hasWebcam,
  effects,
  onEffectsChange,
  onPlanEffects,
  planning,
  spokenPages,
  captions,
  onCaptionsChange,
  captionsEnabled,
  onCaptionsEnabledChange,
  captionBaseline,
  textOverlays,
  onTextOverlaysChange,
  hook,
  title,
  captionsNearTop,
  audioMix,
  onAudioMixChange,
  tracks,
  trending,
  loudness,
  previewUnavailable,
  selection,
  onSelectionChange,
  disabled,
}: {
  src: string
  sourceDurationMs: number
  startMs: number
  endMs: number
  onTrim(startMs: number, endMs: number): void
  hasWebcam: boolean
  effects: ClipEffects | null
  onEffectsChange(effects: ClipEffects): void
  onPlanEffects(): void
  planning: boolean
  spokenPages: readonly CaptionPage[]
  captions: CaptionState
  onCaptionsChange(captions: CaptionState): void
  captionsEnabled: boolean
  onCaptionsEnabledChange(enabled: boolean): void
  captionBaseline: number
  textOverlays: readonly TextOverlay[]
  onTextOverlaysChange(overlays: TextOverlay[]): void
  hook: string
  title: string
  captionsNearTop: boolean
  audioMix: AudioMix
  onAudioMixChange(mix: AudioMix): void
  tracks: readonly MusicTrackSummary[]
  trending: Promise<TrendingMusic>
  loudness: SourceLoudness | null
  previewUnavailable: boolean
  selection: TimelineSelection | null
  onSelectionChange(selection: TimelineSelection | null): void
  disabled?: boolean
}) {
  const id = React.useId()
  const { currentMs, seek } = useVideoPlayer()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const axisRef = React.useRef<HTMLDivElement>(null)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM)
  const [axisWidth, setAxisWidth] = React.useState(0)
  const [view, setView] = React.useState<View>({ start: 0, size: 1 })
  const pendingView = React.useRef<{ ms: number; offset: number } | null>({
    ms: startMs,
    offset: VIEW_GUTTER_PX,
  })
  const [minLanes, setMinLanes] = React.useState<Record<LaneGroup, number>>({
    effects: 1,
    texts: 1,
    music: 0,
  })
  const [musicOpen, setMusicOpen] = React.useState(false)
  const wantsMusic = React.useRef(false)
  const [uploads, setUploads] = React.useState<MusicTrackSummary[]>([])
  const [draft, setDraft] = React.useState<Span | null>(null)
  const draftRef = React.useRef<Span | null>(null)

  const durationMs = endMs - startMs
  const axisStartMs = Math.max(0, startMs - AXIS_PADDING_MS)
  const axisEndMs = Math.min(sourceDurationMs, endMs + AXIS_PADDING_MS)
  const axisMs = Math.max(1, axisEndMs - axisStartMs)
  const leadMs = startMs - axisStartMs
  const shownZoom =
    axisWidth > 0 ? axisWidth / (axisMs / 1000) : zoom || DEFAULT_ZOOM
  const wholeZoom = shownZoom * view.size
  const zoomLevel =
    view.size < 1 && wholeZoom < ZOOM_MAX
      ? clamp(Math.log(1 / view.size) / Math.log(ZOOM_MAX / wholeZoom), 0, 1)
      : 0
  const playheadMs = currentMs - startMs
  const atMs = clamp(playheadMs, 0, durationMs)
  const ticks = rulerTicks(-leadMs, axisMs - leadMs, axisWidth)

  const tiles = React.useMemo(
    () => thumbTiles(axisStartMs, axisEndMs),
    [axisStartMs, axisEndMs]
  )
  const frames = useThumbnails(src, tiles)

  const library = React.useMemo(
    () => [
      ...tracks,
      ...uploads.filter((upload) => !tracks.some((t) => t.id === upload.id)),
    ],
    [tracks, uploads]
  )
  const readyTracks = React.useMemo(
    () =>
      new Map(
        library.flatMap((track) =>
          track.status === "ready" ? [[track.id, track] as const] : []
        )
      ),
    [library]
  )

  const events = React.useMemo(
    () =>
      (effects?.events ?? []).map((event) => ({
        ...event,
        lane: event.lane ?? 0,
      })),
    [effects]
  )
  const blocks = React.useMemo(
    () => captionBlocks(spokenPages, captions),
    [spokenPages, captions]
  )
  const effectLanes = Math.min(
    MAX_EFFECT_LANES,
    Math.max(minLanes.effects, laneCount(events))
  )
  const textLanes = Math.min(
    MAX_TEXT_LANES,
    Math.max(minLanes.texts, laneCount(textOverlays))
  )
  const musicLanes = Math.min(
    MAX_MUSIC_LANES,
    Math.max(minLanes.music, laneCount(audioMix.music, 0))
  )

  const snapMs = React.useMemo(
    () => [
      ...new Set([
        0,
        durationMs,
        ...(playheadMs > 0 && playheadMs < durationMs ? [playheadMs] : []),
        ...textOverlays.flatMap((o) => [o.startMs, o.endMs]),
        ...blocks.flat().flatMap((b) => [b.startMs, b.endMs]),
        ...events.flatMap((e) => [e.startMs - startMs, e.endMs - startMs]),
        ...audioMix.music.flatMap((m) => [m.startMs, m.endMs]),
      ]),
    ],
    [durationMs, playheadMs, textOverlays, blocks, events, startMs, audioMix]
  )

  React.useEffect(() => {
    const axis = axisRef.current
    const scroller = scrollRef.current
    if (!axis || !scroller) return
    const sync = () => {
      setAxisWidth(axis.getBoundingClientRect().width)
      if (scroller.scrollWidth === 0) return
      const start = scroller.scrollLeft / scroller.scrollWidth
      const size = Math.min(1, scroller.clientWidth / scroller.scrollWidth)
      setView((current) =>
        current.start === start && current.size === size
          ? current
          : { start, size }
      )
    }
    const observer = new ResizeObserver(sync)
    observer.observe(axis)
    observer.observe(scroller)
    scroller.addEventListener("scroll", sync, { passive: true })
    return () => {
      observer.disconnect()
      scroller.removeEventListener("scroll", sync)
    }
  }, [])

  const place = (ms: number, offset: number) => {
    const axis = axisRef.current
    const scroller = scrollRef.current
    if (!axis || !scroller) return
    const rect = axis.getBoundingClientRect()
    const frame = scroller.getBoundingClientRect()
    if (rect.width === 0) return
    scroller.scrollLeft +=
      rect.left -
      frame.left +
      ((ms - axisStartMs) / axisMs) * rect.width -
      offset
  }
  const applyPendingView = React.useEffectEvent(() => {
    const pending = pendingView.current
    pendingView.current = null
    if (pending) place(pending.ms, pending.offset)
  })
  React.useLayoutEffect(() => applyPendingView(), [zoom])

  React.useEffect(() => {
    const axis = axisRef.current
    const scroller = scrollRef.current
    if (!axis || !scroller) return
    if (currentMs < startMs - START_SLACK_MS || currentMs > axisEndMs) return
    const rect = axis.getBoundingClientRect()
    const frame = scroller.getBoundingClientRect()
    if (rect.width === 0) return
    const x =
      rect.left - frame.left + ((currentMs - axisStartMs) / axisMs) * rect.width
    if (x < 0 || x > frame.width) scroller.scrollLeft += x - VIEW_GUTTER_PX
  }, [currentMs, startMs, axisStartMs, axisEndMs, axisMs])

  const zoomTo = (next: number, clientX?: number) => {
    if (next === zoom) {
      if (next === ZOOM_FIT) place(startMs, VIEW_GUTTER_PX)
      return
    }
    const axis = axisRef.current
    const scroller = scrollRef.current
    if (axis && scroller) {
      const rect = axis.getBoundingClientRect()
      const frame = scroller.getBoundingClientRect()
      if (next === ZOOM_FIT) {
        pendingView.current = { ms: startMs, offset: VIEW_GUTTER_PX }
      } else if (rect.width > 0) {
        const x = clientX ?? frame.left + frame.width / 2
        pendingView.current = {
          ms: axisStartMs + ((x - rect.left) / rect.width) * axisMs,
          offset: x - frame.left,
        }
      }
    }
    setZoom(next)
  }

  const onWheel = React.useEffectEvent((event: WheelEvent) => {
    const axis = axisRef.current
    const scroller = scrollRef.current
    if (!axis || !scroller) return
    event.preventDefault()
    const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    const deltaX = lines ? event.deltaX * WHEEL_LINE_PX : event.deltaX
    const deltaY = lines ? event.deltaY * WHEEL_LINE_PX : event.deltaY
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      scroller.scrollLeft += deltaX
      return
    }
    const width = axis.getBoundingClientRect().width
    if (width === 0 || deltaY === 0) return
    const seconds = axisMs / 1000
    const whole = (scroller.clientWidth - 2 * VIEW_GUTTER_PX) / seconds
    zoomTo(
      clamp(
        (width / seconds) * Math.exp(-deltaY * WHEEL_ZOOM),
        Math.min(whole, ZOOM_MAX),
        ZOOM_MAX
      ),
      event.clientX
    )
  })

  React.useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const listener = (event: WheelEvent) => onWheel(event)
    scroller.addEventListener("wheel", listener, { passive: false })
    return () => scroller.removeEventListener("wheel", listener)
  }, [])

  const select = (next: TimelineSelection | null) => onSelectionChange(next)
  const isSelected = (next: TimelineSelection) =>
    JSON.stringify(selection) === JSON.stringify(next)
  const anchorFor = (next: TimelineSelection) =>
    isSelected(next) ? setAnchor : undefined
  const noRoom = () =>
    toast.error("No room at the playhead. Move the playhead or free a track.")

  const setEvents = (next: Effect[]) =>
    onEffectsChange({ events: next, edited: true })
  const addEffect = (key: EffectKey) => {
    const kind = EFFECT_KINDS.find((k) => k.key === key)!
    const placed = placeAtPlayhead(
      events,
      { startMs, endMs },
      startMs + atMs,
      kind.lengthMs,
      { minMs: MIN_EFFECT_MS, maxLanes: MAX_EFFECT_LANES }
    )
    if (!placed) return noRoom()
    setEvents([...events, createEffect(key, placed)])
    select({ type: "effect", index: events.length })
  }
  const moveEffect = (index: number, target: Laned) => {
    const next = moveItem(
      events,
      index,
      {
        lane: target.lane,
        startMs: target.startMs + startMs,
        endMs: target.endMs + startMs,
      },
      { startMs, endMs },
      MIN_EFFECT_MS
    )
    if (next) setEvents(next)
  }

  const withSpareLane = (state: CaptionState): CaptionState =>
    state.lanes.length + 1 < MAX_CAPTION_LANES
      ? {
          ...state,
          lanes: [
            ...state.lanes,
            {
              baseline: nextBaseline(
                state.lanes.map((lane) => lane.baseline),
                captionBaseline
              ),
              captions: [],
            },
          ],
        }
      : state
  const addCaptionAtPlayhead = () => {
    const spare = withSpareLane(captions)
    const added = addCaption(
      spare,
      spare === captions ? blocks : [...blocks, []],
      atMs,
      durationMs
    )
    if (!added) return noRoom()
    const state =
      spare !== captions && added.ref.lane <= captions.lanes.length
        ? { ...added.state, lanes: added.state.lanes.slice(0, -1) }
        : added.state
    if (!captionsEnabled) onCaptionsEnabledChange(true)
    onCaptionsChange(state)
    select({ type: "caption", ref: added.ref })
  }
  const placeCaption = (ref: CaptionRef, target: Laned) => {
    const moved = moveCaption(captions, blocks, ref, target, durationMs)
    if (!moved) return
    onCaptionsChange(moved.state)
    if (moved.ref.lane !== ref.lane || moved.ref.index !== ref.index)
      select({ type: "caption", ref: moved.ref })
  }

  const addText = () => {
    const placed = placeAtPlayhead(
      textOverlays,
      { startMs: 0, endMs: durationMs },
      atMs,
      DEFAULT_OVERLAY_MS,
      { minMs: MIN_OVERLAY_MS, maxLanes: MAX_TEXT_LANES }
    )
    if (!placed) return noRoom()
    onTextOverlaysChange([
      ...textOverlays,
      {
        ...placed,
        text: defaultOverlayText(hook, title),
        position: captionsNearTop ? "center" : "top",
      },
    ])
    select({ type: "text", index: textOverlays.length })
  }
  const moveText = (index: number, target: Laned) => {
    const next = moveItem(
      textOverlays,
      index,
      target,
      { startMs: 0, endMs: durationMs },
      MIN_OVERLAY_MS
    )
    if (next) onTextOverlaysChange(next)
  }

  const setMusic = (music: MusicClip[]) =>
    onAudioMixChange({ ...audioMix, music })
  const addMusic = (track: ReadyMusicTrack) => {
    const placed = placeAtPlayhead(
      audioMix.music,
      { startMs: 0, endMs: durationMs },
      atMs,
      track.durationMs,
      { minMs: MIN_MUSIC_MS, maxLanes: MAX_MUSIC_LANES }
    )
    if (!placed) return noRoom()
    setMusic([...audioMix.music, newMusicClip(track.id, placed)])
    setMusicOpen(false)
    select({ type: "music", index: audioMix.music.length })
  }
  const moveMusic = (index: number, target: Laned) => {
    const clip = audioMix.music[index]
    const track = clip && readyTracks.get(clip.trackId)
    if (!track) return
    const next = retimeMusic(
      audioMix.music,
      index,
      target,
      durationMs,
      track.durationMs
    )
    if (next) setMusic(next)
  }

  const addLane = (group: LaneGroup | "captions") => {
    if (group === "captions") {
      onCaptionsChange(withSpareLane(captions))
      return
    }
    const shown = { effects: effectLanes, texts: textLanes, music: musicLanes }
    setMinLanes((current) => ({ ...current, [group]: shown[group] + 1 }))
  }
  const removeCaptionLane = (lane: number) =>
    onCaptionsChange({
      ...captions,
      lanes: captions.lanes.filter((_, i) => i !== lane - 1),
    })

  const deleteSelected = () => {
    if (!selection) return
    if (selection.type === "effect") {
      setEvents(events.filter((_, i) => i !== selection.index))
    } else if (selection.type === "caption") {
      onCaptionsChange(deleteCaption(captions, selection.ref))
    } else if (selection.type === "text") {
      onTextOverlaysChange(textOverlays.filter((_, i) => i !== selection.index))
    } else if (selection.type === "music") {
      setMusic(audioMix.music.filter((_, i) => i !== selection.index))
    } else {
      return
    }
    select(null)
  }
  const deletable =
    selection !== null &&
    selection.type !== "video" &&
    selection.type !== "source"

  const splitSelected = (): (() => void) | undefined => {
    if (selection?.type === "effect") {
      const next = splitItem(
        events,
        selection.index,
        startMs + atMs,
        MIN_EFFECT_MS
      )
      return next && (() => setEvents(next))
    }
    if (selection?.type === "text") {
      const next = splitItem(
        textOverlays,
        selection.index,
        atMs,
        MIN_OVERLAY_MS
      )
      return next && (() => onTextOverlaysChange(next))
    }
    if (selection?.type === "music") {
      const next = splitMusic(
        audioMix.music,
        selection.index,
        atMs,
        MIN_MUSIC_MS
      )
      return next && (() => setMusic(next))
    }
    if (selection?.type === "caption") {
      const next = splitCaption(captions, selection.ref, atMs, MIN_CAPTION_MS)
      return next && (() => onCaptionsChange(next))
    }
    return undefined
  }
  const split = splitSelected()

  const trimTo = (nextStart: number, nextEnd: number) => {
    const length = nextEnd - nextStart
    if (length < CLIP_MIN_EDIT_MS || length > CLIP_MAX_EDIT_MS) {
      toast.error(
        `Keep the clip between ${CLIP_MIN_EDIT_MS / 1000} s and ${CLIP_MAX_EDIT_MS / 60_000} min.`
      )
      return
    }
    onTrim(nextStart, nextEnd)
  }
  const setIn = () => trimTo(currentMs, endMs)
  const setOut = () => trimTo(startMs, currentMs)

  useClipHotkeys(
    disabled
      ? {}
      : {
          s: () => split?.(),
          i: setIn,
          o: setOut,
          delete: deleteSelected,
          backspace: deleteSelected,
        }
  )

  const commitTrim = () => {
    const next = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (next) onTrim(next.startMs, next.endMs)
  }
  const shown = draft ?? { startMs, endMs }

  const seekFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    seek(
      axisStartMs +
        clamp((event.clientX - rect.left) / rect.width, 0, 1) * axisMs
    )
  }

  const focusInspector = (
    next: TimelineSelection,
    event: React.KeyboardEvent
  ) => {
    if (!isSelected(next)) return
    if (event.key !== "Tab" || event.shiftKey) return
    const first = tabbables(popupRef.current)[0]
    if (!first) return
    event.preventDefault()
    first.focus()
  }

  const selectedCaption =
    selection?.type === "caption"
      ? findCaption(blocks, selection.ref)
      : undefined
  const selectedEffect =
    selection?.type === "effect" ? events[selection.index] : undefined
  const selectedText =
    selection?.type === "text" ? textOverlays[selection.index] : undefined
  const selectedMusic =
    selection?.type === "music" ? audioMix.music[selection.index] : undefined
  const inspecting =
    selectedEffect !== undefined ||
    selectedCaption !== undefined ||
    selectedText !== undefined ||
    selectedMusic !== undefined ||
    selection?.type === "video" ||
    selection?.type === "source"

  const sound = audioMix.youtubeSound ?? null
  const span = { leadMs, durationMs, axisMs }
  const sourceLevel = audioMix.sourceMuted ? 0 : level(audioMix.sourceDb)
  const wave = loudnessFor(loudness, { startMs: axisStartMs, endMs: axisEndMs })
  const laneName = (name: string, lane: number) =>
    lane === 0 ? name : `${name} ${lane + 1}`

  return (
    <section
      ref={rootRef}
      aria-label="Timeline"
      data-slot="clip-timeline"
      className="flex h-[296px] shrink-0 flex-col bg-sheet shadow-[inset_0_1px_0_var(--hair)]"
    >
      <div
        role="toolbar"
        aria-label="Timeline tools"
        className="flex h-[46px] shrink-0 items-center gap-1.5 px-3.5 shadow-[inset_0_-1px_0_var(--hair)]"
      >
        <DropdownMenu
          onOpenChangeComplete={(open) => {
            if (open || !wantsMusic.current) return
            wantsMusic.current = false
            setMusicOpen(true)
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                ref={addRef}
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
              />
            }
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            Add
            <CaretDownIcon data-icon="inline-end" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onClick={addText}>
              <TextTIcon aria-hidden />
              Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addCaptionAtPlayhead}>
              <ClosedCaptioningIcon aria-hidden />
              Caption
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                wantsMusic.current = true
              }}
            >
              <MusicNotesIcon aria-hidden />
              Music…
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SparkleIcon aria-hidden />
                Effect
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {EFFECT_KINDS.map((kind) => (
                  <DropdownMenuItem
                    key={kind.key}
                    disabled={kind.key === "cam" && !hasWebcam}
                    onClick={() => addEffect(kind.key)}
                  >
                    {kind.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={planning} onClick={onPlanEffects}>
                  {effects === null ? (
                    <MagicWandIcon aria-hidden />
                  ) : (
                    <ArrowCounterClockwiseIcon aria-hidden />
                  )}
                  {effects === null ? "Auto effects" : "Reset effects to auto"}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PlusIcon aria-hidden />
                Track
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={textLanes >= MAX_TEXT_LANES}
                  onClick={() => addLane("texts")}
                >
                  Text track
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={captions.lanes.length + 1 >= MAX_CAPTION_LANES}
                  onClick={() => addLane("captions")}
                >
                  Captions track
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={effectLanes >= MAX_EFFECT_LANES}
                  onClick={() => addLane("effects")}
                >
                  Effects track
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={musicLanes >= MAX_MUSIC_LANES}
                  onClick={() => addLane("music")}
                >
                  Music track
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover open={musicOpen} onOpenChange={setMusicOpen}>
          <PopoverContent
            anchor={addRef}
            side="top"
            align="start"
            className="w-80"
          >
            <PopoverHeader>
              <PopoverTitle>Add music</PopoverTitle>
              <PopoverDescription>
                Library tracks go on the first music track with room at the
                playhead. YouTube songs are added in the YouTube app.
              </PopoverDescription>
            </PopoverHeader>
            <Label htmlFor={`${id}-track`} className="sr-only">
              Track
            </Label>
            <TrackPicker
              id={`${id}-track`}
              library={library}
              trending={trending}
              value={sound ? { kind: "youtube", sound } : { kind: "none" }}
              onValueChange={(choice) => {
                if (choice.kind === "youtube") {
                  onAudioMixChange({ ...audioMix, youtubeSound: choice.sound })
                  setMusicOpen(false)
                } else if (choice.kind === "track") {
                  const track = readyTracks.get(choice.id)
                  if (track) addMusic(track)
                }
              }}
            />
            <MusicUploadButton
              size="sm"
              onUploaded={(upload) =>
                setUploads((current) => [...current, upload])
              }
            />
          </PopoverContent>
        </Popover>
        <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-hair" />
        <IconAction
          label="Split at playhead"
          shortcut="S"
          size="icon-sm"
          disabled={disabled || !split}
          onClick={() => split?.()}
        >
          <ScissorsIcon aria-hidden />
        </IconAction>
        <IconAction
          label="Set start at playhead"
          shortcut="I"
          size="icon-sm"
          disabled={disabled}
          onClick={setIn}
        >
          <ArrowLineLeftIcon aria-hidden />
        </IconAction>
        <IconAction
          label="Set end at playhead"
          shortcut="O"
          size="icon-sm"
          disabled={disabled}
          onClick={setOut}
        >
          <ArrowLineRightIcon aria-hidden />
        </IconAction>
        <IconAction
          label="Delete selected"
          shortcut="Delete"
          size="icon-sm"
          disabled={disabled || !deletable}
          onClick={deleteSelected}
        >
          <TrashIcon aria-hidden />
        </IconAction>
        {sound ? (
          <span className="ms-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <YoutubeLogoIcon aria-hidden className="size-3.5 shrink-0" />
            <a
              href={youtubeWatchUrl(sound.videoId)}
              target="_blank"
              rel="noreferrer"
              title={`${sound.channelTitle} · add it with Add sound after you upload from the YouTube app.`}
              className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline"
            >
              <span className="truncate">{sound.title}</span>
              <ArrowSquareOutIcon
                aria-label="Opens YouTube"
                className="size-3 shrink-0"
              />
            </a>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Remove the YouTube song"
              disabled={disabled}
              onClick={() =>
                onAudioMixChange({ ...audioMix, youtubeSound: null })
              }
            >
              <XIcon aria-hidden />
            </Button>
          </span>
        ) : previewUnavailable ? null : (
          <span className="ms-2 flex min-w-0 items-center gap-1.5 truncate text-xs text-tertiary max-[1099px]:hidden">
            Drag the clip edges to trim ·<Kbd>I</Kbd>
            <Kbd>O</Kbd>
            set in/out
          </span>
        )}
        {previewUnavailable && (
          <span className="ms-2 truncate text-xs text-amber">
            This browser can&apos;t play the music preview. The render will
            still include it.
          </span>
        )}
        <span className="flex-1" />
        <div
          role="group"
          aria-labelledby={`${id}-zoom`}
          className="flex shrink-0 items-center gap-1.5"
        >
          <span id={`${id}-zoom`} className="sr-only">
            Timeline zoom
          </span>
          <IconAction
            label="Zoom out"
            size="icon-sm"
            disabled={view.size >= 1 || shownZoom <= ZOOM_MIN}
            onClick={() => zoomTo(Math.max(ZOOM_MIN, shownZoom / 2))}
          >
            <MagnifyingGlassMinusIcon aria-hidden />
          </IconAction>
          <Slider
            aria-labelledby={`${id}-zoom`}
            min={0}
            max={Math.log2(ZOOM_MAX / ZOOM_MIN)}
            step={0.1}
            value={[Math.log2(clamp(shownZoom, ZOOM_MIN, ZOOM_MAX) / ZOOM_MIN)]}
            getAriaValueText={() =>
              zoom === ZOOM_FIT
                ? "Fit"
                : `${Math.round(shownZoom)} pixels per second`
            }
            onValueChange={(next) => {
              const value = Array.isArray(next) ? next[0] : next
              if (typeof value === "number") zoomTo(ZOOM_MIN * 2 ** value)
            }}
            className="data-horizontal:w-[110px]"
          />
          <IconAction
            label="Zoom in"
            size="icon-sm"
            disabled={shownZoom >= ZOOM_MAX}
            onClick={() => zoomTo(Math.min(ZOOM_MAX, shownZoom * 2))}
          >
            <MagnifyingGlassPlusIcon aria-hidden />
          </IconAction>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={zoom === ZOOM_FIT}
            className="px-2.5 font-medium aria-pressed:text-foreground"
            onClick={() => zoomTo(ZOOM_FIT)}
          >
            Fit
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full">
          <div className="w-24 shrink-0 shadow-[inset_-1px_0_0_var(--hair)]">
            <div className="h-11" />
            {Array.from({ length: textLanes }, (_, lane) => (
              <TrackLabel key={`text-${lane}`}>
                <TextTIcon aria-hidden />
                <span className="truncate">{laneName("Text", lane)}</span>
              </TrackLabel>
            ))}
            {blocks.map((laneBlocks, lane) => (
              <TrackLabel
                key={`caption-${lane}`}
                className={captionsEnabled ? undefined : "opacity-60"}
              >
                {lane === 0 ? (
                  <LabelToggle
                    aria-label={
                      captionsEnabled ? "Hide captions" : "Show captions"
                    }
                    aria-pressed={!captionsEnabled}
                    disabled={disabled}
                    onClick={() => {
                      onCaptionsEnabledChange(!captionsEnabled)
                      if (selection?.type === "caption") select(null)
                    }}
                  >
                    {captionsEnabled ? (
                      <EyeIcon aria-hidden />
                    ) : (
                      <EyeSlashIcon aria-hidden />
                    )}
                  </LabelToggle>
                ) : (
                  <ClosedCaptioningIcon aria-hidden />
                )}
                <span className="truncate">{laneName("Captions", lane)}</span>
                {lane > 0 && laneBlocks.length === 0 && (
                  <LabelToggle
                    aria-label={`Remove captions track ${lane + 1}`}
                    className="ms-auto"
                    disabled={disabled}
                    onClick={() => removeCaptionLane(lane)}
                  >
                    <XIcon aria-hidden />
                  </LabelToggle>
                )}
              </TrackLabel>
            ))}
            {Array.from({ length: effectLanes }, (_, lane) => (
              <TrackLabel key={`effect-${lane}`}>
                <SparkleIcon aria-hidden />
                <span className="truncate">{laneName("Effects", lane)}</span>
              </TrackLabel>
            ))}
            <TrackLabel className="h-[52px]">
              <FilmStripIcon aria-hidden />
              Video
            </TrackLabel>
            <TrackLabel className="h-10">
              <LabelToggle
                aria-label={
                  audioMix.sourceMuted
                    ? "Unmute original audio"
                    : "Mute original audio"
                }
                aria-pressed={audioMix.sourceMuted}
                disabled={disabled}
                onClick={() =>
                  onAudioMixChange({
                    ...audioMix,
                    sourceMuted: !audioMix.sourceMuted,
                  })
                }
              >
                {audioMix.sourceMuted ? (
                  <SpeakerSlashIcon aria-hidden />
                ) : (
                  <SpeakerHighIcon aria-hidden />
                )}
              </LabelToggle>
              Audio
            </TrackLabel>
            {Array.from({ length: musicLanes }, (_, lane) => (
              <TrackLabel key={`music-${lane}`}>
                <MusicNotesIcon aria-hidden />
                <span className="truncate">{laneName("Music", lane)}</span>
              </TrackLabel>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <ViewHandle
              view={view}
              zoomLevel={zoomLevel}
              scrollRef={scrollRef}
              controls={`${id}-tracks`}
            />
            <div
              ref={scrollRef}
              id={`${id}-tracks`}
              data-testid="timeline-scroller"
              className="flex min-w-0 flex-1 overflow-hidden px-8"
            >
              <div
                ref={axisRef}
                role="presentation"
                className="relative shrink-0 touch-none select-none"
                style={{
                  width:
                    zoom === ZOOM_FIT
                      ? `${(axisMs / durationMs) * 100}%`
                      : `max(100%, ${Math.round((axisMs / 1000) * zoom)}px)`,
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  seekFrom(event)
                  if (selection) select(null)
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                    seekFrom(event)
                }}
              >
                <ClipSpan
                  {...span}
                  className="pointer-events-none top-[26px] bg-white/[0.03]"
                />
                <div aria-hidden className="relative h-[26px] cursor-pointer">
                  {ticks.map((ms) => (
                    <span
                      key={ms}
                      className="absolute top-[7px] -translate-x-1/2 font-mono text-[10.5px] leading-none text-tertiary tabular-nums"
                      style={{ left: `${((ms + leadMs) / axisMs) * 100}%` }}
                    >
                      {formatTick(ms)}
                    </span>
                  ))}
                </div>

                {Array.from({ length: textLanes }, (_, lane) => (
                  <div key={`text-${lane}`} className={LANE}>
                    <ClipSpan {...span}>
                      <TimelineTrack
                        aria-label={`Text track ${lane + 1}`}
                        durationMs={durationMs}
                        lane={String(lane)}
                        group={`${id}-texts`}
                        className={TRACK}
                      >
                        {textOverlays.map((overlay, index) => {
                          if (overlay.lane !== lane) return null
                          const item = { type: "text", index } as const
                          return (
                            <TimelineBlock
                              key={index}
                              ref={anchorFor(item)}
                              aria-label={`Text ${overlay.text} at ${formatTimestamp(overlay.startMs)}`}
                              startMs={overlay.startMs}
                              endMs={overlay.endMs}
                              minMs={MIN_OVERLAY_MS}
                              snapMs={snapMs}
                              selected={isSelected(item)}
                              onSelect={() => select(item)}
                              onDelete={() => {
                                onTextOverlaysChange(
                                  textOverlays.filter((_, i) => i !== index)
                                )
                                select(null)
                              }}
                              onKeyDown={(event) => focusInspector(item, event)}
                              onChange={(s, e) =>
                                moveText(index, { lane, startMs: s, endMs: e })
                              }
                              onLaneChange={(to, s, e) =>
                                moveText(index, {
                                  lane: Number(to),
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                            >
                              {overlay.text}
                            </TimelineBlock>
                          )
                        })}
                      </TimelineTrack>
                    </ClipSpan>
                  </div>
                ))}

                {blocks.map((laneBlocks, lane) => (
                  <div
                    key={`caption-${lane}`}
                    className={cn(LANE, !captionsEnabled && "opacity-50")}
                  >
                    <ClipSpan {...span}>
                      <TimelineTrack
                        aria-label={
                          lane === 0
                            ? "Captions track"
                            : `Captions track ${lane + 1}`
                        }
                        durationMs={durationMs}
                        lane={String(lane)}
                        group={`${id}-captions`}
                        className={TRACK}
                      >
                        {laneBlocks.map((block) => {
                          const item = {
                            type: "caption",
                            ref: { lane, index: block.index },
                          } as const
                          return (
                            <TimelineBlock
                              key={block.index}
                              ref={anchorFor(item)}
                              aria-label={`Caption ${block.text} at ${formatTimestamp(block.startMs)}`}
                              startMs={block.startMs}
                              endMs={block.endMs}
                              minMs={MIN_CAPTION_MS}
                              snapMs={snapMs}
                              variant="tone"
                              tone={block.index < 0 ? "sky" : "mint"}
                              className="px-[7px] font-normal text-foreground"
                              selected={isSelected(item)}
                              onSelect={() => select(item)}
                              onDelete={() => {
                                onCaptionsChange(
                                  deleteCaption(captions, item.ref)
                                )
                                select(null)
                              }}
                              onKeyDown={(event) => focusInspector(item, event)}
                              onChange={(s, e) =>
                                placeCaption(item.ref, {
                                  lane,
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                              onLaneChange={(to, s, e) =>
                                placeCaption(item.ref, {
                                  lane: Number(to),
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                            >
                              {block.text}
                            </TimelineBlock>
                          )
                        })}
                      </TimelineTrack>
                    </ClipSpan>
                  </div>
                ))}

                {Array.from({ length: effectLanes }, (_, lane) => (
                  <div key={`effect-${lane}`} className={LANE}>
                    <ClipSpan {...span}>
                      <TimelineTrack
                        aria-label={`Effects track ${lane + 1}`}
                        durationMs={durationMs}
                        lane={String(lane)}
                        group={`${id}-effects`}
                        className={TRACK}
                      >
                        {events.map((effect, index) => {
                          if (effect.lane !== lane) return null
                          const item = { type: "effect", index } as const
                          const text = effectText(effect)
                          const inert = effect.kind === "focus" && !hasWebcam
                          return (
                            <TimelineBlock
                              key={index}
                              ref={anchorFor(item)}
                              aria-label={`${text} at ${formatTimestamp(effect.startMs - startMs)}`}
                              startMs={effect.startMs - startMs}
                              endMs={effect.endMs - startMs}
                              minMs={MIN_EFFECT_MS}
                              snapMs={snapMs}
                              variant={inert ? "muted" : "tone"}
                              tone={inert ? undefined : effectTone(effect)}
                              selected={isSelected(item)}
                              onSelect={() => select(item)}
                              onKeyDown={(event) => focusInspector(item, event)}
                              onDelete={() => {
                                setEvents(events.filter((_, i) => i !== index))
                                select(null)
                              }}
                              onChange={(s, e) =>
                                moveEffect(index, {
                                  lane,
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                              onLaneChange={(to, s, e) =>
                                moveEffect(index, {
                                  lane: Number(to),
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                            >
                              {text}
                            </TimelineBlock>
                          )
                        })}
                      </TimelineTrack>
                    </ClipSpan>
                  </div>
                ))}

                <div className="relative h-[52px]">
                  <div
                    aria-hidden
                    data-testid="video-thumbnails"
                    className="pointer-events-none absolute inset-x-0 inset-y-1 flex gap-0.5 overflow-hidden rounded-lg"
                  >
                    {tiles.map((tile) => {
                      const frame = frames.get(tile.atMs)
                      return (
                        <span
                          key={tile.atMs}
                          className="min-w-0 basis-0 bg-graphite-2 bg-[length:auto_100%] bg-repeat-x"
                          style={{
                            flexGrow: tile.lengthMs,
                            backgroundImage: frame
                              ? `url(${frame})`
                              : undefined,
                          }}
                        />
                      )
                    })}
                  </div>
                  <Outside
                    fromMs={0}
                    toMs={shown.startMs - axisStartMs}
                    axisMs={axisMs}
                    className="inset-y-1 rounded-l-lg bg-sheet/78"
                  />
                  <Outside
                    fromMs={shown.endMs - axisStartMs}
                    toMs={axisMs}
                    axisMs={axisMs}
                    className="inset-y-1 rounded-r-lg bg-sheet/78"
                  />
                  <TimelineTrack
                    aria-label="Video track"
                    durationMs={axisMs}
                    className={TRACK}
                  >
                    <TimelineBlock
                      ref={anchorFor({ type: "video" })}
                      aria-label={`Clip ${formatTimestamp(shown.startMs)} → ${formatTimestamp(shown.endMs)}`}
                      startMs={shown.startMs - axisStartMs}
                      endMs={shown.endMs - axisStartMs}
                      minMs={CLIP_MIN_EDIT_MS}
                      snapMs={[currentMs - axisStartMs]}
                      variant="clip"
                      selected={isSelected({ type: "video" })}
                      onSelect={() => select({ type: "video" })}
                      onKeyDown={(event) =>
                        focusInspector({ type: "video" }, event)
                      }
                      onChange={(s, e) => {
                        if (e - s > CLIP_MAX_EDIT_MS) return
                        const next = {
                          startMs: s + axisStartMs,
                          endMs: e + axisStartMs,
                        }
                        draftRef.current = next
                        setDraft(next)
                      }}
                      onCommit={commitTrim}
                    />
                  </TimelineTrack>
                </div>

                <div className="relative h-10">
                  {wave && (
                    <Waveform
                      data-testid="source-waveform"
                      values={wave.values}
                      gain={sourceLevel * 0.85}
                      className="absolute top-1.5 h-[calc(100%-0.75rem)] text-amber/45"
                      style={{
                        left: `${((wave.startMs - axisStartMs) / axisMs) * 100}%`,
                        width: `${((wave.endMs - wave.startMs) / axisMs) * 100}%`,
                      }}
                    />
                  )}
                  <Outside
                    fromMs={0}
                    toMs={leadMs}
                    axisMs={axisMs}
                    className="inset-y-0 bg-sheet/70"
                  />
                  <Outside
                    fromMs={leadMs + durationMs}
                    toMs={axisMs}
                    axisMs={axisMs}
                    className="inset-y-0 bg-sheet/70"
                  />
                  <ClipSpan {...span}>
                    <div
                      ref={anchorFor({ type: "source" })}
                      role="button"
                      tabIndex={0}
                      aria-label={`Original audio ${audioMix.sourceMuted ? "muted" : `${audioMix.sourceDb} dB`}`}
                      aria-pressed={isSelected({ type: "source" })}
                      data-selected={
                        isSelected({ type: "source" }) || undefined
                      }
                      className="absolute inset-x-0 inset-y-[5px] cursor-pointer rounded-[7px] outline-none hover:bg-white/[0.04] focus-visible:focus-ring data-[selected]:inset-ring-[1.5px] data-[selected]:inset-ring-lav"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => select({ type: "source" })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          select({ type: "source" })
                        }
                        focusInspector({ type: "source" }, event)
                      }}
                    />
                  </ClipSpan>
                </div>

                {Array.from({ length: musicLanes }, (_, lane) => (
                  <div key={`music-${lane}`} className={LANE}>
                    <ClipSpan {...span}>
                      <TimelineTrack
                        aria-label={`Music track ${lane + 1}`}
                        durationMs={durationMs}
                        lane={String(lane)}
                        group={`${id}-music`}
                        className={TRACK}
                      >
                        {audioMix.music.map((clip, index) => {
                          if (clip.lane !== lane) return null
                          const item = { type: "music", index } as const
                          const track = readyTracks.get(clip.trackId)
                          const name = track?.title ?? "Missing track"
                          return (
                            <TimelineBlock
                              key={index}
                              ref={anchorFor(item)}
                              aria-label={`Music ${name} at ${formatTimestamp(clip.startMs)}`}
                              startMs={clip.startMs}
                              endMs={clip.endMs}
                              minMs={MIN_MUSIC_MS}
                              snapMs={snapMs}
                              variant="tone"
                              tone="mint"
                              className="text-foreground"
                              selected={isSelected(item)}
                              onSelect={() => select(item)}
                              onDelete={() => {
                                setMusic(
                                  audioMix.music.filter((_, i) => i !== index)
                                )
                                select(null)
                              }}
                              onKeyDown={(event) => focusInspector(item, event)}
                              onChange={(s, e) =>
                                moveMusic(index, { lane, startMs: s, endMs: e })
                              }
                              onLaneChange={(to, s, e) =>
                                moveMusic(index, {
                                  lane: Number(to),
                                  startMs: s,
                                  endMs: e,
                                })
                              }
                            >
                              {track && (
                                <Waveform
                                  data-testid="music-waveform"
                                  values={peaksFor(track, clip)}
                                  gain={level(clip.db)}
                                  className="absolute inset-0 size-full text-mint/45"
                                />
                              )}
                              <span className="relative">{name}</span>
                            </TimelineBlock>
                          )
                        })}
                      </TimelineTrack>
                    </ClipSpan>
                  </div>
                ))}

                {currentMs >= axisStartMs && currentMs <= axisEndMs && (
                  <div
                    aria-hidden
                    data-testid="timeline-playhead"
                    className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-amber"
                    style={{
                      left: `${((currentMs - axisStartMs) / axisMs) * 100}%`,
                    }}
                  >
                    <span className="absolute top-0.5 left-1/2 -translate-x-1/2 rounded-md bg-amber px-1.5 py-[3px] font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap text-night tabular-nums">
                      {formatTick(Math.round(playheadMs))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Popover
        open={inspecting}
        onOpenChange={(open, details) => {
          if (open) return
          const target =
            details.event instanceof FocusEvent
              ? details.event.relatedTarget
              : details.event?.target
          if (
            (details.reason === "outside-press" ||
              details.reason === "focus-out") &&
            target instanceof Element &&
            (rootRef.current?.contains(target) ||
              target.closest("[data-effect-focus-picker]"))
          ) {
            return
          }
          select(null)
        }}
      >
        {inspecting && (
          <PopoverContent
            ref={popupRef}
            anchor={anchor}
            side="top"
            initialFocus={false}
            finalFocus={false}
            data-hotkeys-through=""
            className="w-80"
            onKeyDown={(event) => {
              if (!anchor) return
              if (event.key === "Escape") {
                anchor.focus()
                return
              }
              if (event.key !== "Tab") return
              const items = tabbables(popupRef.current)
              if (event.target !== (event.shiftKey ? items[0] : items.at(-1)))
                return
              if (event.shiftKey) event.preventDefault()
              anchor.focus()
            }}
          >
            {selection?.type === "effect" && selectedEffect && (
              <EffectInspector
                effect={selectedEffect}
                clipStartMs={startMs}
                hasWebcam={hasWebcam}
                onChange={(effect) =>
                  setEvents(
                    events.map((e, i) => (i === selection.index ? effect : e))
                  )
                }
                onDelete={deleteSelected}
              />
            )}
            {selection?.type === "caption" && selectedCaption && (
              <CaptionInspector
                key={`${selection.ref.lane}:${selection.ref.index}`}
                title={
                  selectedCaption.index < 0 ? "Written caption" : "Caption"
                }
                text={selectedCaption.text}
                startMs={selectedCaption.startMs}
                endMs={selectedCaption.endMs}
                edited={
                  selectedCaption.index >= 0 &&
                  Boolean(captions.pageEdits[selectedCaption.index])
                }
                onTextChange={(text) =>
                  onCaptionsChange(
                    setCaptionText(captions, selection.ref, text)
                  )
                }
                onReset={
                  selectedCaption.index >= 0
                    ? () => {
                        const pageEdits = { ...captions.pageEdits }
                        delete pageEdits[selectedCaption.index]
                        onCaptionsChange({ ...captions, pageEdits })
                      }
                    : undefined
                }
                onDelete={deleteSelected}
              />
            )}
            {selection?.type === "text" && selectedText && (
              <TextInspector
                overlay={selectedText}
                captionsNearTop={captionsNearTop}
                onChange={(overlay) =>
                  onTextOverlaysChange(
                    textOverlays.map((o, i) =>
                      i === selection.index ? overlay : o
                    )
                  )
                }
                onDelete={deleteSelected}
              />
            )}
            {selection?.type === "music" && selectedMusic && (
              <MusicInspector
                clip={selectedMusic}
                track={readyTracks.get(selectedMusic.trackId)}
                duck={audioMix.duck}
                onChange={(clip) => {
                  const track = readyTracks.get(clip.trackId)
                  const endMs = track
                    ? Math.min(
                        clip.endMs,
                        clip.startMs + track.durationMs - clip.inMs
                      )
                    : clip.endMs
                  setMusic(
                    audioMix.music.map((c, i) =>
                      i === selection.index ? { ...clip, endMs } : c
                    )
                  )
                }}
                onDuckChange={(duck) => onAudioMixChange({ ...audioMix, duck })}
                onDelete={deleteSelected}
              />
            )}
            {selection?.type === "source" && (
              <SourceInspector mix={audioMix} onChange={onAudioMixChange} />
            )}
            {selection?.type === "video" && (
              <VideoInspector startMs={startMs} endMs={endMs} onTrim={onTrim} />
            )}
          </PopoverContent>
        )}
      </Popover>
    </section>
  )
}
