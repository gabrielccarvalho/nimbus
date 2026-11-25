"use client"

import { ArrowSquareOutIcon, MusicNotesIcon } from "@phosphor-icons/react"
import * as React from "react"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import type { TrendingMusic as TrendingMusicResult } from "@/features/music/schema"
import { formatDuration } from "@/lib/format"

const views = new Intl.NumberFormat("en", { notation: "compact" })
const regions = new Intl.DisplayNames(["en"], { type: "region" })

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-tertiary">{children}</p>
}

function TrendingList({
  trending,
  headingId,
}: {
  trending: Promise<TrendingMusicResult>
  headingId: string
}) {
  const result = React.use(trending)
  if (result.status === "no_channel") {
    return (
      <Note>
        Connect YouTube in Settings › Connected channels to see what&apos;s
        trending.
      </Note>
    )
  }
  if (result.status === "error") return <Note>{result.message}</Note>
  const region = regions.of(result.region) ?? result.region
  if (result.tracks.length === 0) {
    return <Note>YouTube has no music chart for {region}.</Note>
  }
  return (
    <>
      <Note>
        Top music on YouTube in {region} right now. These can&apos;t go into the
        render: download the clip, open it in the YouTube app and add the song
        with Add sound.
      </Note>
      <ItemGroup
        aria-labelledby={headingId}
        className="max-h-96 gap-1 overflow-y-auto"
      >
        {result.tracks.map((track, index) => (
          <div key={track.videoId} role="listitem">
            <Item
              size="xs"
              render={
                <a
                  href={`https://www.youtube.com/watch?v=${track.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <span className="w-5 text-end font-mono text-xs text-tertiary tabular-nums">
                {index + 1}
              </span>
              <ItemMedia variant="image">
                {track.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
                  <img src={track.thumbnailUrl} alt="" />
                ) : (
                  <MusicNotesIcon aria-hidden />
                )}
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-1">{track.title}</ItemTitle>
                <ItemDescription className="line-clamp-1">
                  {[
                    track.channelTitle,
                    track.durationMs !== null &&
                      formatDuration(track.durationMs),
                    `${views.format(track.views)} views`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ArrowSquareOutIcon aria-label="Opens YouTube" />
              </ItemActions>
            </Item>
          </div>
        ))}
      </ItemGroup>
    </>
  )
}

export function TrendingMusic({
  trending,
}: {
  trending: Promise<TrendingMusicResult>
}) {
  const headingId = React.useId()
  return (
    <div className="flex flex-col gap-2">
      <h4 id={headingId} className="text-[13px] font-medium">
        Trending on YouTube
      </h4>
      <React.Suspense
        fallback={
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <TrendingList trending={trending} headingId={headingId} />
      </React.Suspense>
    </div>
  )
}
