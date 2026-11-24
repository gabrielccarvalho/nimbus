"use client"

import * as React from "react"

import {
  CaptionPreview,
  CaptionPreviewText,
} from "@/components/ui/caption-preview"
import { buildCaptionPages } from "@/features/captions/pages"
import {
  captionBaseline,
  cssCaptionStyle,
  type CaptionStyle,
} from "@/features/captions/styles"
import { OUTPUT_HEIGHT, SPLIT_HEIGHTS } from "@/features/layout/geometry"

const SAMPLE = "No way he just clipped that"
const CAM_SHARE = SPLIT_HEIGHTS["cam-top"][0] / OUTPUT_HEIGHT

const sampleWords = SAMPLE.split(" ").map((text, i) => ({
  text,
  startMs: i * 300,
  endMs: i * 300 + 260,
}))

export function CaptionStylePreview({
  style,
  className,
}: {
  style: CaptionStyle
  className?: string
}) {
  const page = React.useMemo(
    () =>
      buildCaptionPages(sampleWords, 3000, {
        maxWordsPerPage: style.maxWordsPerPage,
        maxCharsPerLine: style.maxCharsPerLine,
      })[0]!,
    [style.maxWordsPerPage, style.maxCharsPerLine]
  )
  return (
    <CaptionPreview
      role="img"
      aria-label="Caption preview"
      className={className}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 bg-[radial-gradient(circle_at_50%_70%,rgb(255_179_107/0.35),transparent_60%),linear-gradient(160deg,#2a2440,#14131c)]"
        style={{ height: `${CAM_SHARE * 100}%` }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-[linear-gradient(200deg,#1d3b4a,#0f1a24_55%,#241a30)]"
        style={{ top: `${CAM_SHARE * 100}%` }}
      />
      <CaptionPreviewText
        pages={[page]}
        currentMs={page.words[Math.min(1, page.words.length - 1)]!.startMs}
        captionStyle={cssCaptionStyle(style)}
        baseline={captionBaseline(style, { mode: "cam-top" })}
      />
    </CaptionPreview>
  )
}
