"use client"

import { PlayIcon } from "@phosphor-icons/react"
import Image from "next/image"
import * as React from "react"

import { formatDuration } from "@/lib/format"

export function SourcePreview({
  videoSrc,
  thumbnailSrc,
  durationMs,
}: {
  videoSrc: string | null
  thumbnailSrc: string | null
  durationMs: number | null
}) {
  const [playing, setPlaying] = React.useState(false)

  if (playing && videoSrc) {
    return (
      <video
        src={videoSrc}
        poster={thumbnailSrc ?? undefined}
        controls
        autoPlay
        className="aspect-video w-full rounded-[18px] bg-black"
      />
    )
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-[18px] bg-graphite-2 bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.07)_1px,transparent_1.5px)] bg-size-[11px_11px]">
      {thumbnailSrc && (
        <Image
          src={thumbnailSrc}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 420px, 100vw"
          className="object-cover"
        />
      )}
      {videoSrc && (
        <button
          type="button"
          aria-label="Play source video"
          onClick={() => setPlaying(true)}
          className="absolute top-1/2 left-1/2 grid size-[52px] -translate-1/2 place-items-center rounded-full bg-white/10 inset-ring-1 inset-ring-white/14 backdrop-blur-md transition-colors hover:bg-white/16"
        >
          <PlayIcon weight="fill" className="size-4" aria-hidden />
        </button>
      )}
      {durationMs ? (
        <span className="absolute end-2.5 bottom-2.5 rounded-[7px] bg-night/72 px-[7px] py-[5px] font-mono text-[11px] leading-none font-semibold backdrop-blur-sm">
          {formatDuration(durationMs)}
        </span>
      ) : null}
    </div>
  )
}
