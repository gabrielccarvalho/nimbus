"use client"

import { MusicNotesIcon, YoutubeLogoIcon } from "@phosphor-icons/react"
import * as React from "react"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox"
import { Spinner } from "@/components/ui/spinner"
import {
  type MusicTrackSummary,
  type TrendingMusic,
  type TrendingVideo,
  type YoutubeSound,
} from "@/features/music/schema"
import { formatDuration } from "@/lib/format"

const views = new Intl.NumberFormat("en", { notation: "compact" })
const regions = new Intl.DisplayNames(["en"], { type: "region" })

export type TrackChoice =
  | { kind: "none" }
  | { kind: "track"; id: string }
  | { kind: "youtube"; sound: YoutubeSound }

type Option =
  | { key: string; kind: "track"; label: string; track: MusicTrackSummary }
  | { key: string; kind: "youtube"; label: string; video: TrendingVideo }

type OptionGroup = { value: string; items: Option[] }

function trackDetail(track: MusicTrackSummary) {
  if (track.status === "processing") return "Processing…"
  if (track.status === "failed") return "Couldn't be read"
  return formatDuration(track.durationMs)
}

function videoDetail(video: TrendingVideo) {
  return [
    video.channelTitle,
    video.durationMs !== null && formatDuration(video.durationMs),
    `${views.format(video.views)} views`,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function toYoutubeSound(video: TrendingVideo): YoutubeSound {
  return {
    videoId: video.videoId,
    title: video.title.slice(0, 200),
    channelTitle: video.channelTitle.slice(0, 200),
    thumbnailUrl: video.thumbnailUrl,
  }
}

function useTrending(trending: Promise<TrendingMusic>) {
  const [result, setResult] = React.useState<TrendingMusic | null>(null)
  React.useEffect(() => {
    let live = true
    void trending.then((next) => {
      if (live) setResult(next)
    })
    return () => {
      live = false
    }
  }, [trending])
  return result
}

function trendingNote(result: TrendingMusic | null) {
  if (result === null) return "Loading what's trending on YouTube…"
  if (result.status === "no_channel") {
    return "Connect YouTube in Settings › Connected channels to pick from what's trending."
  }
  if (result.status === "error") return result.message
  const region = regions.of(result.region) ?? result.region
  if (result.tracks.length === 0) {
    return `YouTube has no music chart for ${region}.`
  }
  return `Trending songs are the top music on YouTube in ${region}. They aren't mixed into the render: you add them in the YouTube app.`
}

export function TrackPicker({
  id,
  library,
  trending,
  value,
  onValueChange,
  disabled,
}: {
  id?: string
  library: readonly MusicTrackSummary[]
  trending: Promise<TrendingMusic>
  value: TrackChoice
  onValueChange: (value: TrackChoice) => void
  disabled?: boolean
}) {
  const result = useTrending(trending)
  const trendingVideos = React.useMemo(
    () => (result?.status === "ok" ? result.tracks : []),
    [result]
  )

  const groups = React.useMemo<OptionGroup[]>(() => {
    const own: Option[] = library.map((track) => ({
      key: `track:${track.id}`,
      kind: "track" as const,
      label: track.title,
      track,
    }))
    const chart: Option[] = trendingVideos.map((video) => ({
      key: `youtube:${video.videoId}`,
      kind: "youtube" as const,
      label: video.title,
      video,
    }))
    return [
      { value: "Your music", items: own },
      { value: "Trending on YouTube", items: chart },
    ].filter((group) => group.items.length > 0)
  }, [library, trendingVideos])

  const selectedKey =
    value.kind === "track"
      ? `track:${value.id}`
      : value.kind === "youtube"
        ? `youtube:${value.sound.videoId}`
        : null
  const selected =
    groups.flatMap((group) => group.items).find((o) => o.key === selectedKey) ??
    (value.kind === "youtube"
      ? ({
          key: `youtube:${value.sound.videoId}`,
          kind: "youtube",
          label: value.sound.title,
          video: { ...value.sound, durationMs: null, views: 0 },
        } satisfies Option)
      : null)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Combobox<Option>
        items={groups}
        value={selected}
        disabled={disabled}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.key}
        onValueChange={(option) => {
          if (!option) {
            onValueChange({ kind: "none" })
          } else if (option.kind === "track") {
            onValueChange({ kind: "track", id: option.track.id })
          } else {
            onValueChange({
              kind: "youtube",
              sound: toYoutubeSound(option.video),
            })
          }
        }}
      >
        <ComboboxInput
          id={id}
          placeholder="No music"
          aria-description="Type to search your music and trending songs"
          showClear={selected !== null}
          disabled={disabled}
          className="w-full"
        />
        <ComboboxContent className="min-w-[min(22rem,var(--available-width))]">
          <ComboboxEmpty>
            {groups.length === 0
              ? "Upload a track to use music."
              : "No songs match."}
          </ComboboxEmpty>
          <ComboboxList>
            {(group: OptionGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(option: Option) => (
                    <ComboboxItem
                      key={option.key}
                      value={option}
                      disabled={
                        option.kind === "track" &&
                        option.track.status !== "ready"
                      }
                      className="py-1.5"
                    >
                      {option.kind === "youtube" ? (
                        option.video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
                          <img
                            src={option.video.thumbnailUrl}
                            alt=""
                            className="size-8 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <YoutubeLogoIcon aria-hidden className="size-8" />
                        )
                      ) : option.kind === "track" &&
                        option.track.status === "processing" ? (
                        <Spinner aria-hidden />
                      ) : (
                        <MusicNotesIcon aria-hidden />
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{option.label}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {option.kind === "track"
                            ? trackDetail(option.track)
                            : videoDetail(option.video)}
                        </span>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="text-[13px] text-tertiary">{trendingNote(result)}</p>
    </div>
  )
}
