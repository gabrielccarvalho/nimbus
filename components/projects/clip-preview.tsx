"use client"

import * as React from "react"

import {
  CaptionPreview,
  CaptionPreviewOverlay,
  CaptionPreviewText,
} from "@/components/ui/caption-preview"
import { useVideoPlayer } from "@/components/ui/video-player"
import { overlayFontSize, type TextOverlay } from "@/features/captions/overlay"
import type { CaptionPage } from "@/features/captions/pages"
import {
  captionBaseline,
  cssCaptionStyle,
  cssColor,
  type CaptionStyle,
} from "@/features/captions/styles"
import type { Effect } from "@/features/effects/schema"
import type { LayoutInput } from "@/features/layout/schema"

import { VerticalPreviewCanvas } from "./vertical-preview"

export function ClipLoop({
  startMs,
  endMs,
}: {
  startMs: number
  endMs: number
}) {
  const { currentMs, paused, seek } = useVideoPlayer()
  React.useEffect(() => {
    if (currentMs < startMs - 250 || currentMs >= endMs) seek(startMs)
  }, [currentMs, paused, startMs, endMs, seek])
  return null
}

export function ClipPreview({
  layout,
  effects,
  pages,
  startMs,
  captionStyle,
  captionsEnabled,
  onBaselineChange,
  overlay,
  className,
}: {
  layout: LayoutInput
  effects?: readonly Effect[]
  pages: CaptionPage[]
  startMs: number
  captionStyle: CaptionStyle
  captionsEnabled: boolean
  onBaselineChange?: (baseline: number) => void
  overlay?: TextOverlay | null
  className?: string
}) {
  const { currentMs } = useVideoPlayer()
  const placeable = captionsEnabled && Boolean(onBaselineChange)
  const showOverlay =
    overlay && currentMs - startMs < (overlay.untilMs ?? Infinity)
  return (
    <CaptionPreview
      role={placeable ? "group" : "img"}
      aria-label="Vertical preview with captions"
      className={className}
    >
      <VerticalPreviewCanvas
        layout={layout}
        effects={effects}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      {captionsEnabled && (
        <CaptionPreviewText
          pages={pages}
          currentMs={currentMs - startMs}
          captionStyle={cssCaptionStyle(captionStyle)}
          baseline={captionBaseline(captionStyle, layout)}
          onBaselineChange={onBaselineChange}
          aria-label={onBaselineChange ? "Caption position" : undefined}
        />
      )}
      {showOverlay && (
        <CaptionPreviewOverlay
          text={overlay.text}
          position={overlay.position}
          fontFamily={cssCaptionStyle(captionStyle).fontFamily}
          fontSize={overlayFontSize(captionStyle)}
          color={cssColor("background")}
          outlineColor={cssColor("foreground")}
        />
      )}
    </CaptionPreview>
  )
}
