"use client"

import {
  ArrowCounterClockwiseIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  ClosedCaptioningIcon,
  EyeIcon,
  EyeSlashIcon,
  MagicWandIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MinusIcon,
  MusicNotesIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  StackPlusIcon,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TimelineBlock, TimelineTrack } from "@/components/ui/timeline-track"
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
import { planClipEffectsAction } from "@/features/clips/actions"
import {
  CAPTION_MAX_OFFSET_MS,
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
import type { LayoutInput } from "@/features/layout/schema"
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
import { formatTimestamp } from "@/lib/format"

import {
  CaptionInspector,
  EffectInspector,
  effectLabel,
  MusicInspector,
  SourceInspector,
  TextInspector,
  VideoInspector,
} from "./timeline-inspector"

export type TimelineSelection =
  | { type: "video" }
  | { type: "source" }
  | { type: "effect"; index: number }
  | { type: "caption"; ref: CaptionRef }
  | { type: "text"; index: number }
  | { type: "music"; index: number }

type LaneGroup = "effects" | "texts" | "music"

const HEADER_PX = 128
const ZOOM_LEVELS = [0, 20, 40, 80, 160, 320] as const
const DEFAULT_ZOOM = 3
const AXIS_PADDING_MS = 10_000
const TICK_STEPS_MS = [500, 1000, 2000, 5000, 10_000, 30_000, 60_000]
const MIN_TICK_PX = 64
const OFFSET_STEP_MS = 100
const LANE_BASELINE_STEP = 0.15
const LEVEL_FLOOR_DB = -40

const EFFECT_KINDS = [
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

function effectClass(effect: Effect) {
  if (effect.kind === "zoom") return undefined
  if (effect.kind === "shake") return "border-chart-5 bg-chart-5/30"
  return effect.target === "game"
    ? "border-effect-game bg-effect-game/30"
    : "border-chart-4 bg-chart-4/30"
}

function effectText(effect: Effect) {
  if (effect.kind === "zoom") return `Zoom ${effect.scale}×`
  if (effect.kind === "shake") return `Shake ${effect.intensity}`
  return effectLabel(effect)
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const level = (db: number) => Math.max(0, 1 - db / LEVEL_FLOOR_DB)

function formatOffset(ms: number) {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : ""
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)} s`
}

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
  if (!loudness) return []
  const from = Math.floor(
    (span.startMs - loudness.fromMs) / loudness.intervalMs
  )
  const to = Math.ceil((span.endMs - loudness.fromMs) / loudness.intervalMs)
  return loudness.values.slice(Math.max(0, from), Math.max(0, to))
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

function TrackRow({
  header,
  className,
  children,
}: {
  header?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex h-9", className)}>
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center gap-1 bg-graphite pr-2 text-xs text-muted-foreground"
        style={{ width: HEADER_PX }}
      >
        {header}
      </div>
      <div className="relative min-w-0 flex-1 rounded-md bg-muted/40">
        {children}
      </div>
    </div>
  )
}

function ClipSpan({
  leadMs,
  durationMs,
  axisMs,
  children,
}: {
  leadMs: number
  durationMs: number
  axisMs: number
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute inset-y-0"
      style={{
        left: `${(leadMs / axisMs) * 100}%`,
        width: `${(durationMs / axisMs) * 100}%`,
      }}
    >
      {children}
    </div>
  )
}

export function ClipTimeline({
  projectId,
  clipId,
  sourceDurationMs,
  startMs,
  endMs,
  onTrim,
  layoutOverride,
  hasWebcam,
  effects,
  onEffectsChange,
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
  projectId: string
  clipId: string
  sourceDurationMs: number
  startMs: number
  endMs: number
  onTrim(startMs: number, endMs: number): void
  layoutOverride: LayoutInput | null
  hasWebcam: boolean
  effects: ClipEffects | null
  onEffectsChange(effects: ClipEffects): void
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
  const rulerRef = React.useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM)
  const [rulerWidth, setRulerWidth] = React.useState(0)
  const [minLanes, setMinLanes] = React.useState<Record<LaneGroup, number>>({
    effects: 1,
    texts: 1,
    music: 1,
  })
  const [musicOpen, setMusicOpen] = React.useState(false)
  const [uploads, setUploads] = React.useState<MusicTrackSummary[]>([])
  const [planning, startPlanning] = React.useTransition()
  const [draft, setDraft] = React.useState<Span | null>(null)
  const draftRef = React.useRef<Span | null>(null)

  const durationMs = endMs - startMs
  const axisStartMs = Math.max(0, startMs - AXIS_PADDING_MS)
  const axisEndMs = Math.min(sourceDurationMs, endMs + AXIS_PADDING_MS)
  const axisMs = Math.max(1, axisEndMs - axisStartMs)
  const leadMs = startMs - axisStartMs
  const pxPerSecond = ZOOM_LEVELS[zoom]!
  const playheadMs = currentMs - startMs
  const atMs = clamp(playheadMs, 0, durationMs)
  const ticks = rulerTicks(-leadMs, axisMs - leadMs, rulerWidth)

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
    Math.max(minLanes.music, laneCount(audioMix.music))
  )

  React.useEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) return
    const observer = new ResizeObserver(() =>
      setRulerWidth(ruler.getBoundingClientRect().width)
    )
    observer.observe(ruler)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || pxPerSecond === 0) return
    const x =
      HEADER_PX +
      ((currentMs - axisStartMs) / axisMs) * (scroller.scrollWidth - HEADER_PX)
    const { scrollLeft, clientWidth } = scroller
    if (x < scrollLeft + HEADER_PX || x > scrollLeft + clientWidth - 24) {
      scroller.scrollLeft = x - HEADER_PX - (clientWidth - HEADER_PX) / 4
    }
  }, [currentMs, axisStartMs, axisMs, pxPerSecond])

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
  const planEffects = () =>
    startPlanning(async () => {
      const planned = await planClipEffectsAction(projectId, clipId, {
        startMs,
        endMs,
        layoutOverride,
      })
      if (!planned.ok) {
        toast.error(planned.error.message)
        return
      }
      select(null)
      onEffectsChange(planned.value)
    })

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
  const shiftCaptions = (delta: number) =>
    onCaptionsChange({
      ...captions,
      offsetMs: clamp(
        captions.offsetMs + delta,
        -CAPTION_MAX_OFFSET_MS,
        CAPTION_MAX_OFFSET_MS
      ),
    })
  const captionsEdited =
    captions.offsetMs !== 0 || Object.keys(captions.pageEdits).length > 0

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

  const selectedEffect =
    selection?.type === "effect" ? events[selection.index] : undefined
  const selectedCaption =
    selection?.type === "caption"
      ? findCaption(blocks, selection.ref)
      : undefined
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

  return (
    <section
      ref={rootRef}
      aria-label="Timeline"
      data-slot="clip-timeline"
      className="grid gap-3 rounded-[18px] bg-graphite px-[18px] py-4"
    >
      <div
        role="toolbar"
        aria-label="Timeline tools"
        className="flex flex-wrap items-center gap-1.5"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" size="sm" disabled={disabled} />}
          >
            <SparkleIcon data-icon="inline-start" aria-hidden />
            Effect
            <CaretDownIcon data-icon="inline-end" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {EFFECT_KINDS.map((kind) => (
              <DropdownMenuItem
                key={kind.key}
                disabled={kind.key === "cam" && !hasWebcam}
                onClick={() => addEffect(kind.key)}
              >
                {kind.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={addCaptionAtPlayhead}
        >
          <ClosedCaptioningIcon data-icon="inline-start" aria-hidden />
          Caption
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={addText}>
          <TextTIcon data-icon="inline-start" aria-hidden />
          Text
        </Button>
        <Popover open={musicOpen} onOpenChange={setMusicOpen}>
          <PopoverTrigger
            render={<Button type="button" size="sm" disabled={disabled} />}
          >
            <MusicNotesIcon data-icon="inline-start" aria-hidden />
            Music
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" size="sm" disabled={disabled} />}
          >
            <StackPlusIcon data-icon="inline-start" aria-hidden />
            Track
            <CaretDownIcon data-icon="inline-end" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              disabled={effectLanes >= MAX_EFFECT_LANES}
              onClick={() => addLane("effects")}
            >
              Effects track
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={captions.lanes.length + 1 >= MAX_CAPTION_LANES}
              onClick={() => addLane("captions")}
            >
              Captions track
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={textLanes >= MAX_TEXT_LANES}
              onClick={() => addLane("texts")}
            >
              Text track
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={musicLanes >= MAX_MUSIC_LANES}
              onClick={() => addLane("music")}
            >
              Music track
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span aria-hidden className="mx-1 h-5 w-px bg-hair" />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Start the clip at the playhead"
          disabled={disabled}
          onClick={() => onTrim(currentMs, endMs)}
        >
          <ArrowLineLeftIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="End the clip at the playhead"
          disabled={disabled}
          onClick={() => onTrim(startMs, currentMs)}
        >
          <ArrowLineRightIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Delete selected"
          disabled={disabled || !deletable}
          onClick={deleteSelected}
        >
          <TrashIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || planning}
          onClick={planEffects}
        >
          {effects === null ? (
            <MagicWandIcon data-icon="inline-start" aria-hidden />
          ) : (
            <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
          )}
          {effects === null ? "Auto effects" : "Reset effects to auto"}
        </Button>
        <div
          role="group"
          aria-label="Timeline zoom"
          className="ms-auto flex items-center gap-1"
        >
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom out"
            disabled={zoom === 0}
            onClick={() => setZoom(zoom - 1)}
          >
            <MagnifyingGlassMinusIcon aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={zoom === 0}
            onClick={() => setZoom(0)}
          >
            Fit
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            disabled={zoom === ZOOM_LEVELS.length - 1}
            onClick={() => setZoom(zoom + 1)}
          >
            <MagnifyingGlassPlusIcon aria-hidden />
          </Button>
        </div>
      </div>

      {sound && (
        <Item variant="outline" size="sm">
          <ItemMedia variant="image">
            {sound.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
              <img src={sound.thumbnailUrl} alt="" />
            ) : (
              <YoutubeLogoIcon aria-hidden />
            )}
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="line-clamp-1">
              <a
                href={youtubeWatchUrl(sound.videoId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {sound.title}
                <ArrowSquareOutIcon aria-label="Opens YouTube" />
              </a>
            </ItemTitle>
            <ItemDescription className="line-clamp-1">
              {sound.channelTitle} · add it with Add sound after you upload from
              the YouTube app.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove the YouTube song"
              disabled={disabled}
              onClick={() =>
                onAudioMixChange({ ...audioMix, youtubeSound: null })
              }
            >
              <XIcon aria-hidden />
            </Button>
          </ItemActions>
        </Item>
      )}
      {previewUnavailable && (
        <p className="text-[13px] text-amber">
          This browser can&apos;t play the music preview. The render will still
          include it.
        </p>
      )}

      <div
        ref={scrollRef}
        data-testid="timeline-scroller"
        className="overflow-x-auto overscroll-x-contain pb-1"
      >
        <div
          className="relative grid gap-1"
          style={{
            width:
              pxPerSecond === 0
                ? "100%"
                : `max(100%, ${HEADER_PX + (axisMs / 1000) * pxPerSecond}px)`,
          }}
        >
          <div className="flex h-5">
            <div
              className="sticky left-0 z-20 shrink-0 bg-graphite"
              style={{ width: HEADER_PX }}
            />
            <div
              ref={rulerRef}
              role="presentation"
              className="relative min-w-0 flex-1 cursor-pointer touch-none select-none"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId)
                seekFrom(event)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                  seekFrom(event)
              }}
            >
              {ticks.map((ms) => (
                <span
                  key={ms}
                  aria-hidden
                  className="absolute inset-y-0 border-l border-hair pl-1 font-mono text-[10px] leading-5 text-muted-foreground tabular-nums"
                  style={{ left: `${((ms + leadMs) / axisMs) * 100}%` }}
                >
                  {formatTick(ms)}
                </span>
              ))}
            </div>
          </div>

          {Array.from({ length: textLanes }, (_, lane) => (
            <TrackRow
              key={`text-${lane}`}
              header={
                <>
                  <TextTIcon aria-hidden />
                  Text {lane + 1}
                </>
              }
            >
              <ClipSpan {...span}>
                <TimelineTrack
                  aria-label={`Text track ${lane + 1}`}
                  durationMs={durationMs}
                  lane={String(lane)}
                  group={`${id}-texts`}
                  className="h-full"
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
                        className="border-amber bg-amber/20"
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
            </TrackRow>
          ))}

          {blocks.map((laneBlocks, lane) => (
            <TrackRow
              key={`caption-${lane}`}
              className={captionsEnabled ? undefined : "opacity-50"}
              header={
                lane === 0 ? (
                  <>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
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
                    </Button>
                    <span className="truncate">Captions</span>
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Caption timing"
                            className="ms-auto"
                          />
                        }
                      >
                        <SlidersHorizontalIcon aria-hidden />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72">
                        <PopoverHeader>
                          <PopoverTitle>Caption timing</PopoverTitle>
                          <PopoverDescription>
                            Moves every spoken caption. Trimming resets edits to
                            spoken captions.
                          </PopoverDescription>
                        </PopoverHeader>
                        <div
                          role="group"
                          aria-label="Shift all captions"
                          className="flex items-center gap-1"
                        >
                          <Button
                            type="button"
                            size="icon-sm"
                            aria-label="Show captions earlier"
                            disabled={
                              disabled ||
                              captions.offsetMs <= -CAPTION_MAX_OFFSET_MS
                            }
                            onClick={() => shiftCaptions(-OFFSET_STEP_MS)}
                          >
                            <MinusIcon aria-hidden />
                          </Button>
                          <output
                            aria-live="polite"
                            className="w-14 text-center font-mono text-xs tabular-nums"
                          >
                            {formatOffset(captions.offsetMs)}
                          </output>
                          <Button
                            type="button"
                            size="icon-sm"
                            aria-label="Show captions later"
                            disabled={
                              disabled ||
                              captions.offsetMs >= CAPTION_MAX_OFFSET_MS
                            }
                            onClick={() => shiftCaptions(OFFSET_STEP_MS)}
                          >
                            <PlusIcon aria-hidden />
                          </Button>
                        </div>
                        {captionsEdited && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={disabled}
                            onClick={() => {
                              if (selection?.type === "caption") select(null)
                              onCaptionsChange({
                                ...captions,
                                pageEdits: {},
                                offsetMs: 0,
                              })
                            }}
                          >
                            <ArrowCounterClockwiseIcon
                              data-icon="inline-start"
                              aria-hidden
                            />
                            Reset spoken captions
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </>
                ) : (
                  <>
                    <ClosedCaptioningIcon aria-hidden />
                    <span className="truncate">Captions {lane + 1}</span>
                    {laneBlocks.length === 0 && (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove captions track ${lane + 1}`}
                        className="ms-auto"
                        disabled={disabled}
                        onClick={() => removeCaptionLane(lane)}
                      >
                        <XIcon aria-hidden />
                      </Button>
                    )}
                  </>
                )
              }
            >
              <ClipSpan {...span}>
                <TimelineTrack
                  aria-label={
                    lane === 0 ? "Captions track" : `Captions track ${lane + 1}`
                  }
                  durationMs={durationMs}
                  lane={String(lane)}
                  group={`${id}-captions`}
                  className="h-full"
                >
                  {laneBlocks.map((block) => {
                    const item = {
                      type: "caption",
                      ref: { lane, index: block.index },
                    } as const
                    const edited =
                      block.index >= 0 &&
                      Boolean(captions.pageEdits[block.index])
                    return (
                      <TimelineBlock
                        key={block.index}
                        ref={anchorFor(item)}
                        aria-label={`Caption ${block.text} at ${formatTimestamp(block.startMs)}`}
                        startMs={block.startMs}
                        endMs={block.endMs}
                        minMs={MIN_CAPTION_MS}
                        className={
                          block.index < 0
                            ? "border-sky bg-sky/20"
                            : edited
                              ? "border-lav bg-lav/25"
                              : "border-chart-2 bg-chart-2/25"
                        }
                        selected={isSelected(item)}
                        onSelect={() => select(item)}
                        onDelete={() => {
                          onCaptionsChange(deleteCaption(captions, item.ref))
                          select(null)
                        }}
                        onKeyDown={(event) => focusInspector(item, event)}
                        onChange={(s, e) =>
                          placeCaption(item.ref, { lane, startMs: s, endMs: e })
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
            </TrackRow>
          ))}

          {Array.from({ length: effectLanes }, (_, lane) => (
            <TrackRow
              key={`effect-${lane}`}
              header={
                <>
                  <SparkleIcon aria-hidden />
                  Effects {lane + 1}
                </>
              }
            >
              <ClipSpan {...span}>
                <TimelineTrack
                  aria-label={`Effects track ${lane + 1}`}
                  durationMs={durationMs}
                  lane={String(lane)}
                  group={`${id}-effects`}
                  className="h-full"
                >
                  {events.map((effect, index) => {
                    if (effect.lane !== lane) return null
                    const item = { type: "effect", index } as const
                    const text = effectText(effect)
                    return (
                      <TimelineBlock
                        key={index}
                        ref={anchorFor(item)}
                        aria-label={`${text} at ${formatTimestamp(effect.startMs - startMs)}`}
                        startMs={effect.startMs - startMs}
                        endMs={effect.endMs - startMs}
                        minMs={MIN_EFFECT_MS}
                        variant={
                          effect.kind === "focus" && !hasWebcam
                            ? "muted"
                            : "default"
                        }
                        className={
                          effect.kind === "focus" && !hasWebcam
                            ? undefined
                            : effectClass(effect)
                        }
                        selected={isSelected(item)}
                        onSelect={() => select(item)}
                        onDelete={() => {
                          setEvents(events.filter((_, i) => i !== index))
                          select(null)
                        }}
                        onKeyDown={(event) => focusInspector(item, event)}
                        onChange={(s, e) =>
                          moveEffect(index, { lane, startMs: s, endMs: e })
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
            </TrackRow>
          ))}

          <TrackRow
            header={
              <>
                <span
                  aria-hidden
                  className="size-3.5 rounded-sm bg-foreground/40"
                />
                Video
              </>
            }
          >
            <TimelineTrack
              aria-label="Video track"
              durationMs={axisMs}
              className="h-full bg-transparent"
            >
              <TimelineBlock
                ref={anchorFor({ type: "video" })}
                aria-label={`Clip ${formatTimestamp(shown.startMs)} → ${formatTimestamp(shown.endMs)}`}
                startMs={shown.startMs - axisStartMs}
                endMs={shown.endMs - axisStartMs}
                minMs={CLIP_MIN_EDIT_MS}
                variant="muted"
                className="border-foreground/40 bg-foreground/15 text-foreground"
                selected={isSelected({ type: "video" })}
                onSelect={() => select({ type: "video" })}
                onKeyDown={(event) => focusInspector({ type: "video" }, event)}
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
              >
                {formatTimestamp(shown.startMs)} →{" "}
                {formatTimestamp(shown.endMs)}
              </TimelineBlock>
            </TimelineTrack>
          </TrackRow>

          <TrackRow
            header={
              <>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
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
                </Button>
                <span className="truncate">Original</span>
              </>
            }
          >
            <ClipSpan {...span}>
              <div
                ref={anchorFor({ type: "source" })}
                role="button"
                tabIndex={0}
                aria-label={`Original audio ${audioMix.sourceMuted ? "muted" : `${audioMix.sourceDb} dB`}`}
                aria-pressed={isSelected({ type: "source" })}
                data-selected={isSelected({ type: "source" }) || undefined}
                className="absolute inset-x-0 inset-y-1 flex items-center overflow-hidden rounded-md border border-chart-3 bg-chart-3/15 px-2 text-[10px] font-medium text-chart-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[selected]:ring-2 data-[selected]:ring-ring"
                onClick={() => select({ type: "source" })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    select({ type: "source" })
                  }
                  focusInspector({ type: "source" }, event)
                }}
              >
                <Waveform
                  data-testid="source-waveform"
                  values={loudnessFor(loudness, { startMs, endMs })}
                  gain={sourceLevel * 0.85}
                  className="absolute inset-0 size-full text-chart-3/50"
                />
              </div>
            </ClipSpan>
          </TrackRow>

          {Array.from({ length: musicLanes }, (_, lane) => (
            <TrackRow
              key={`music-${lane}`}
              header={
                <>
                  <MusicNotesIcon aria-hidden />
                  Music {lane + 1}
                </>
              }
            >
              <ClipSpan {...span}>
                <TimelineTrack
                  aria-label={`Music track ${lane + 1}`}
                  durationMs={durationMs}
                  lane={String(lane)}
                  group={`${id}-music`}
                  className="h-full"
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
                        className="border-mint bg-mint/10 text-foreground"
                        selected={isSelected(item)}
                        onSelect={() => select(item)}
                        onDelete={() => {
                          setMusic(audioMix.music.filter((_, i) => i !== index))
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
            </TrackRow>
          ))}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10"
            style={{ left: HEADER_PX }}
          >
            {currentMs >= axisStartMs && currentMs <= axisEndMs && (
              <div
                className="absolute inset-y-0 w-px bg-foreground"
                style={{
                  left: `${((currentMs - axisStartMs) / axisMs) * 100}%`,
                }}
              />
            )}
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
            rootRef.current?.contains(target)
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
            initialFocus={false}
            finalFocus={false}
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
