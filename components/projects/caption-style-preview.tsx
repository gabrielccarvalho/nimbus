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
import { useMessages } from "@/lib/i18n/client"

import { overview } from "./messages/overview"

const CAM_SHARE = SPLIT_HEIGHTS["cam-top"][0] / OUTPUT_HEIGHT

export function CaptionStylePreview({
  style,
  onBaselineChange,
  className,
}: {
  style: CaptionStyle
  onBaselineChange?: (baseline: number) => void
  className?: string
}) {
  const t = useMessages(overview).captionStyle
  const page = React.useMemo(
    () =>
      buildCaptionPages(
        t.previewSample.split(" ").map((text, i) => ({
          text,
          startMs: i * 300,
          endMs: i * 300 + 260,
        })),
        3000,
        {
          maxWordsPerPage: style.maxWordsPerPage,
          maxCharsPerLine: style.maxCharsPerLine,
        }
      )[0]!,
    [t.previewSample, style.maxWordsPerPage, style.maxCharsPerLine]
  )
  return (
    <CaptionPreview
      role={onBaselineChange ? "group" : "img"}
      aria-label={t.preview}
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
        onBaselineChange={onBaselineChange}
        aria-label={onBaselineChange ? t.previewPosition : undefined}
      />
    </CaptionPreview>
  )
}
