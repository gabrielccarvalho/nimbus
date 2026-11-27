"use client"

import { FilmSlateIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AppHeaderState } from "@/components/app-shell/app-header"
import {
  HEADER_STATE_SLOT_ID,
  HeaderSlot,
} from "@/components/app-shell/header-slot"
import { languageLabel } from "@/components/settings/settings-fields"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Timeline,
  TimelinePlayhead,
  TimelineRange,
} from "@/components/ui/timeline"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import { createClipAction } from "@/features/clips/actions"
import { CLIP_MAX_EDIT_MS, CLIP_MIN_EDIT_MS } from "@/features/clips/schema"
import type { AudioSummary } from "@/features/projects/queries"
import { findActiveIndex } from "@/features/transcription/lookup"
import type { Segment, Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { AudioTimelineLayers } from "./audio-timeline"
import { TimelineDock } from "./timeline-dock"

export type TranscriptClip = {
  id: string
  title: string
  startMs: number
  endMs: number
}

type TranscriptViewProps = {
  projectId: string
  src: string
  poster?: string
  durationMs: number
  words: Word[]
  segments: Segment[]
  language: string
  clips: TranscriptClip[]
  audio?: AudioSummary
}

const SPEEDS = ["0.75", "1", "1.5"]
const count = new Intl.NumberFormat("en")

type Selection = { anchor: number; focus: number }

export function TranscriptView({
  projectId,
  src,
  poster,
  durationMs,
  words,
  segments,
  language,
  clips,
  audio,
}: TranscriptViewProps) {
  const router = useRouter()
  const [selection, setSelection] = React.useState<Selection | null>(null)
  const [pending, startTransition] = React.useTransition()
  const first = selection ? Math.min(selection.anchor, selection.focus) : -1
  const last = selection ? Math.max(selection.anchor, selection.focus) : -1
  const range = selection && {
    startMs: segments[first]!.startMs,
    endMs: segments[last]!.endMs,
  }
  const length = range ? range.endMs - range.startMs : 0
  const fits = length >= CLIP_MIN_EDIT_MS && length <= CLIP_MAX_EDIT_MS
  const selectionLabel = !range
    ? "Click a line, then shift-click another to select a range."
    : `${last - first + 1} ${last === first ? "line" : "lines"} · ${formatTimestamp(range.startMs)} → ${formatTimestamp(range.endMs)}${
        fits
          ? ""
          : length < CLIP_MIN_EDIT_MS
            ? ` · at least ${CLIP_MIN_EDIT_MS / 1000} s needed`
            : ` · at most ${CLIP_MAX_EDIT_MS / 1000} s`
      }`
  const makeClip = () =>
    range &&
    startTransition(async () => {
      const result = await createClipAction(projectId, range)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success("Clip added")
      router.push(`/projects/${projectId}/clips/${result.value.clipId}`)
    })

  return (
    <VideoPlayerProvider>
      <HeaderSlot target={HEADER_STATE_SLOT_ID}>
        {range && (
          <AppHeaderState className="font-mono tabular-nums max-md:hidden">
            · {(length / 1000).toFixed(1)} s selected
          </AppHeaderState>
        )}
      </HeaderSlot>
      <HeaderSlot>
        {selection && (
          <Button variant="ghost" onClick={() => setSelection(null)}>
            Clear
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!range || !fits || pending}
          onClick={makeClip}
        >
          Make a clip
        </Button>
      </HeaderSlot>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Recording"
          className="flex min-w-0 flex-1 flex-col gap-2 p-[18px] pb-3"
        >
          <PlayerBar durationMs={durationMs} />
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <VideoPlayer
              aria-label="Source video"
              className="max-h-full rounded-[14px] lg:h-full lg:w-auto"
            >
              <VideoPlayerVideo src={src} poster={poster} />
              <SpokenLine segments={segments} />
              <VideoPlayerControls>
                <VideoPlayerPlayButton />
                <VideoPlayerSeekBar />
                <VideoPlayerTime />
                <VideoPlayerMuteButton />
              </VideoPlayerControls>
            </VideoPlayer>
          </div>
        </section>
        <TranscriptPanel
          projectId={projectId}
          words={words}
          segments={segments}
          language={language}
          clips={clips}
          selection={selection}
          onSelectionChange={setSelection}
          selectionLabel={selectionLabel}
        />
      </div>
      <TimelineDock
        label="Recording"
        durationMs={durationMs}
        summary={
          range
            ? `${formatTimestamp(range.startMs)} → ${formatTimestamp(range.endMs)}`
            : `${clips.length} ${clips.length === 1 ? "clip" : "clips"}`
        }
        legend={[
          { kind: "clip", label: "Clip" },
          { kind: "selected", label: "Your selection" },
          ...(audio
            ? [
                { kind: "silence" as const, label: "Silence" },
                ...(audio.audience.length > 0
                  ? [
                      {
                        kind: "audience" as const,
                        label: "Most rewatched on YouTube",
                      },
                    ]
                  : []),
              ]
            : []),
          { kind: "playhead", label: "Playhead" },
        ]}
      >
        <SeekTimeline
          durationMs={durationMs}
          audio={audio}
          clips={clips}
          range={range}
        />
      </TimelineDock>
    </VideoPlayerProvider>
  )
}

function SpokenLine({ segments }: { segments: Segment[] }) {
  const { currentMs } = useVideoPlayer()
  const segment = segments[findActiveIndex(segments, currentMs)]
  if (!segment) return null
  return (
    <p
      aria-hidden
      className="pointer-events-none absolute inset-x-[12%] bottom-[18%] text-center text-lg font-medium text-balance text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]"
    >
      {segment.text}
    </p>
  )
}

function PlayerBar({ durationMs }: { durationMs: number }) {
  const { currentMs, videoRef } = useVideoPlayer()
  const [speed, setSpeed] = React.useState("1")
  return (
    <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="mono-label">Source</span>
      <span className="font-mono text-[13px] tabular-nums">
        {formatTimestamp(currentMs)}{" "}
        <span className="text-tertiary">/ {formatTimestamp(durationMs)}</span>
      </span>
      <span className="flex-1" />
      <ToggleGroup
        aria-label="Playback speed"
        size="sm"
        value={[speed]}
        onValueChange={(value) => {
          const next = value[0]
          if (!next) return
          setSpeed(next)
          if (videoRef.current) videoRef.current.playbackRate = Number(next)
        }}
      >
        {SPEEDS.map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {value}×
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function SeekTimeline({
  durationMs,
  audio,
  clips,
  range,
}: {
  durationMs: number
  audio?: AudioSummary
  clips: TranscriptClip[]
  range: { startMs: number; endMs: number } | null
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
      {clips.map((clip) => (
        <TimelineRange
          key={clip.id}
          className="min-w-1"
          startMs={clip.startMs}
          endMs={clip.endMs}
          title={clip.title}
        />
      ))}
      {range && (
        <TimelineRange
          variant="selected"
          className="min-w-1"
          startMs={range.startMs}
          endMs={range.endMs}
        />
      )}
      <TimelinePlayhead />
    </Timeline>
  )
}

function TranscriptPanel({
  projectId,
  words,
  segments,
  language,
  clips,
  selection,
  onSelectionChange,
  selectionLabel,
}: {
  projectId: string
  words: Word[]
  segments: Segment[]
  language: string
  clips: TranscriptClip[]
  selection: Selection | null
  onSelectionChange: React.Dispatch<React.SetStateAction<Selection | null>>
  selectionLabel: string
}) {
  const { currentMs, seek } = useVideoPlayer()
  const [query, setQuery] = React.useState("")
  const [follow, setFollow] = React.useState(true)
  const activeWord = findActiveIndex(words, currentMs)
  const activeSegment = findActiveIndex(segments, currentMs)
  const listRef = React.useRef<HTMLOListElement>(null)

  const needle = query.trim().toLowerCase()
  const visible = React.useMemo(
    () =>
      segments
        .map((segment, index) => ({ segment, index }))
        .filter(
          ({ segment }) =>
            !needle || segment.text.toLowerCase().includes(needle)
        ),
    [segments, needle]
  )
  const clipStarts = React.useMemo(() => {
    const starts = new Map<number, TranscriptClip>()
    for (const clip of clips.toSorted((a, b) => a.startMs - b.startMs)) {
      const index = segments.findIndex((s) => s.endMs > clip.startMs)
      if (index >= 0 && !starts.has(index)) starts.set(index, clip)
    }
    return starts
  }, [clips, segments])

  React.useEffect(() => {
    if (!follow || activeSegment === -1) return
    listRef.current
      ?.querySelector(`[data-segment="${activeSegment}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [follow, activeSegment])

  const first = selection ? Math.min(selection.anchor, selection.focus) : -1
  const last = selection ? Math.max(selection.anchor, selection.focus) : -1
  const pick = React.useCallback(
    (index: number, extend: boolean) => {
      onSelectionChange((current) =>
        extend && current
          ? { anchor: current.anchor, focus: index }
          : { anchor: index, focus: index }
      )
      seek(segments[index]!.startMs)
    },
    [seek, segments, onSelectionChange]
  )

  return (
    <section
      aria-label="Transcript"
      className="grid max-h-[820px] w-full min-w-0 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] lg:max-h-none lg:w-[440px] lg:shadow-[inset_1px_0_0_var(--hair)]"
    >
      <div className="grid gap-3 px-4 pt-4 pb-3 shadow-[inset_0_-1px_0_var(--hair)]">
        <InputGroup className="rounded-full">
          <InputGroupAddon className="ps-3">
            <MagnifyingGlassIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search transcript"
            placeholder={`Search ${count.format(words.length)} words`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="mono-label text-tertiary" aria-live="polite">
            {needle
              ? `${visible.length} of ${segments.length} lines match`
              : `${count.format(segments.length)} lines · ${count.format(words.length)} words · ${languageLabel(language)}`}
          </span>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="follow-playback"
              className="text-[13px] font-normal text-muted-foreground"
            >
              Follow playback
            </Label>
            <Switch
              id="follow-playback"
              checked={follow}
              onCheckedChange={setFollow}
            />
          </div>
        </div>
      </div>
      <ol
        ref={listRef}
        className="grid content-start gap-0.5 overflow-y-auto p-2"
      >
        {visible.map(({ segment, index }) => {
          const clip = needle ? undefined : clipStarts.get(index)
          return (
            <React.Fragment key={index}>
              {clip && (
                <li className="mx-2 mt-2.5 mb-1">
                  <Link
                    href={`/projects/${projectId}/clips/${clip.id}`}
                    className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-lav hover:underline"
                  >
                    <FilmSlateIcon className="size-3.5" aria-hidden />
                    {clip.title}
                  </Link>
                </li>
              )}
              <TranscriptSegment
                index={index}
                segment={segment}
                words={words}
                active={index === activeSegment}
                activeWord={index === activeSegment ? activeWord : -1}
                selected={index >= first && index <= last}
                onPick={pick}
                onSeek={seek}
              />
            </React.Fragment>
          )
        })}
        {visible.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            No lines match “{query.trim()}”.
          </li>
        )}
      </ol>
      <p
        className="px-4 py-3 text-[12.5px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]"
        aria-live="polite"
      >
        {selectionLabel}
      </p>
    </section>
  )
}

const TranscriptSegment = React.memo(function TranscriptSegment({
  index,
  segment,
  words,
  active,
  activeWord,
  selected,
  onPick,
  onSeek,
}: {
  index: number
  segment: Segment
  words: Word[]
  active: boolean
  activeWord: number
  selected: boolean
  onPick: (index: number, extend: boolean) => void
  onSeek: (ms: number) => void
}) {
  const segmentWords = words.slice(segment.firstWord, segment.lastWord + 1)
  return (
    <li
      data-segment={index}
      data-active={active || undefined}
      data-selected={selected || undefined}
      className="flex gap-3 rounded-[10px] px-2.5 py-2 transition-colors data-selected:bg-lav/10 data-selected:inset-ring-1 data-selected:inset-ring-lav/40 data-active:bg-glass-2"
    >
      <button
        type="button"
        onClick={(event) => onPick(index, event.shiftKey)}
        className="h-fit shrink-0 rounded pt-0.5 font-mono text-[11.5px] text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-lav"
        aria-label={`Play from ${formatTimestamp(segment.startMs)}`}
        aria-pressed={selected}
      >
        {formatTimestamp(segment.startMs)}
      </button>
      <p
        className="text-sm leading-relaxed"
        onClick={(event) => {
          if (event.shiftKey) {
            onPick(index, true)
            return
          }
          const start = (event.target as HTMLElement).dataset.start
          if (start) onSeek(Number(start))
        }}
      >
        {segmentWords.map((word, offset) => {
          const wordIndex = segment.firstWord + offset
          return (
            <React.Fragment key={wordIndex}>
              <span
                data-start={word.startMs}
                aria-current={wordIndex === activeWord || undefined}
                className={cn(
                  "cursor-pointer rounded-sm transition-colors hover:bg-glass-2",
                  word.confidence < 0.5 &&
                    "underline decoration-tertiary decoration-dotted",
                  wordIndex === activeWord && "bg-lav text-night hover:bg-lav"
                )}
              >
                {word.text}
              </span>{" "}
            </React.Fragment>
          )
        })}
      </p>
    </li>
  )
})
