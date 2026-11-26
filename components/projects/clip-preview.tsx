"use client"

import * as React from "react"

import {
  CaptionPreview,
  CaptionPreviewOverlay,
  CaptionPreviewText,
} from "@/components/ui/caption-preview"
import { useVideoPlayer } from "@/components/ui/video-player"
import { overlayFontSize, type TextOverlay } from "@/features/captions/overlay"
import type { CaptionLane } from "@/features/captions/pages"
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
  lanes,
  startMs,
  captionStyle,
  captionsEnabled,
  onBaselineChange,
  overlays = [],
  className,
}: {
  layout: LayoutInput
  effects?: readonly Effect[]
  lanes: readonly CaptionLane<number | null>[]
  startMs: number
  captionStyle: CaptionStyle
  captionsEnabled: boolean
  onBaselineChange?: (lane: number, baseline: number) => void
  overlays?: readonly TextOverlay[]
  className?: string
}) {
  const { currentMs } = useVideoPlayer()
  const placeable = captionsEnabled && Boolean(onBaselineChange)
  const clipMs = currentMs - startMs
  const style = cssCaptionStyle(captionStyle)
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
      {captionsEnabled &&
        lanes.map((lane, index) => (
          <CaptionPreviewText
            key={index}
            pages={lane.pages}
            currentMs={clipMs}
            captionStyle={style}
            baseline={lane.baseline ?? captionBaseline(captionStyle, layout)}
            onBaselineChange={
              onBaselineChange &&
              ((baseline) => onBaselineChange(index, baseline))
            }
            aria-label={
              onBaselineChange
                ? index === 0
                  ? "Caption position"
                  : `Captions ${index + 1} position`
                : undefined
            }
          />
        ))}
      {overlays
        .filter(
          (overlay) => overlay.startMs <= clipMs && clipMs < overlay.endMs
        )
        .map((overlay, index) => (
          <CaptionPreviewOverlay
            key={index}
            text={overlay.text}
            position={overlay.position}
            fontFamily={style.fontFamily}
            fontSize={overlayFontSize(captionStyle)}
            color={cssColor("background")}
            outlineColor={cssColor("foreground")}
          />
        ))}
    </CaptionPreview>
  )
}
