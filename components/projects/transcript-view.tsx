"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import * as React from "react"

import { AudioTimelineLayers } from "./audio-timeline"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Timeline, TimelinePlayhead } from "@/components/ui/timeline"
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
import type { AudioSummary } from "@/features/projects/queries"
import { findActiveIndex } from "@/features/transcription/lookup"
import type { Segment, Word } from "@/features/transcription/schema"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

type TranscriptViewProps = {
  src: string
  poster?: string
  durationMs: number
  words: Word[]
  segments: Segment[]
  audio?: AudioSummary
}

export function TranscriptView({
  src,
  poster,
  durationMs,
  words,
  segments,
  audio,
}: TranscriptViewProps) {
  return (
    <VideoPlayerProvider>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <VideoPlayer aria-label="Source video">
            <VideoPlayerVideo src={src} poster={poster} />
            <VideoPlayerControls>
              <VideoPlayerPlayButton />
              <VideoPlayerSeekBar />
              <VideoPlayerTime />
              <VideoPlayerMuteButton />
            </VideoPlayerControls>
          </VideoPlayer>
          {audio && <PlayerTimeline durationMs={durationMs} audio={audio} />}
        </div>
        <TranscriptPanel words={words} segments={segments} />
      </div>
    </VideoPlayerProvider>
  )
}

function PlayerTimeline({
  durationMs,
  audio,
}: {
  durationMs: number
  audio: AudioSummary
}) {
  const { currentMs, seek } = useVideoPlayer()
  return (
    <Timeline
      aria-label="Timeline"
      durationMs={durationMs}
      value={currentMs}
      onValueChange={seek}
    >
      <AudioTimelineLayers audio={audio} />
      <TimelinePlayhead />
    </Timeline>
  )
}

function TranscriptPanel({
  words,
  segments,
}: {
  words: Word[]
  segments: Segment[]
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

  React.useEffect(() => {
    if (!follow || activeSegment === -1) return
    listRef.current
      ?.querySelector(`[data-segment="${activeSegment}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [follow, activeSegment])

  return (
    <section aria-label="Transcript" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <MagnifyingGlassIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search transcript"
            placeholder="Search transcript"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Switch
            id="follow-playback"
            checked={follow}
            onCheckedChange={setFollow}
          />
          <Label htmlFor="follow-playback">Follow playback</Label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {needle
          ? `${visible.length} of ${segments.length} lines match`
          : `${segments.length} lines · ${words.length} words`}
      </p>
      <ol
        ref={listRef}
        className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-xl border p-2"
      >
        {visible.map(({ segment, index }) => (
          <TranscriptSegment
            key={index}
            index={index}
            segment={segment}
            words={words}
            active={index === activeSegment}
            activeWord={index === activeSegment ? activeWord : -1}
            onSeek={seek}
          />
        ))}
        {visible.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            No lines match “{query.trim()}”.
          </li>
        )}
      </ol>
    </section>
  )
}

const TranscriptSegment = React.memo(function TranscriptSegment({
  index,
  segment,
  words,
  active,
  activeWord,
  onSeek,
}: {
  index: number
  segment: Segment
  words: Word[]
  active: boolean
  activeWord: number
  onSeek: (ms: number) => void
}) {
  const segmentWords = words.slice(segment.firstWord, segment.lastWord + 1)
  return (
    <li
      data-segment={index}
      data-active={active || undefined}
      className="group/segment flex gap-3 rounded-lg p-2 data-active:bg-muted"
    >
      <button
        type="button"
        onClick={() => onSeek(segment.startMs)}
        className="h-fit shrink-0 rounded font-mono text-xs text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Play from ${formatTimestamp(segment.startMs)}`}
      >
        {formatTimestamp(segment.startMs)}
      </button>
      <p
        className="text-sm leading-relaxed"
        onClick={(event) => {
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
                  "cursor-pointer rounded-sm transition-colors hover:bg-accent",
                  word.confidence < 0.5 &&
                    "underline decoration-muted-foreground decoration-dotted",
                  wordIndex === activeWord &&
                    "bg-primary text-primary-foreground hover:bg-primary"
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
