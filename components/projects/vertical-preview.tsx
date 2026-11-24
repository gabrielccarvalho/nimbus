"use client"

import * as React from "react"

import { useVideoPlayer } from "@/components/ui/video-player"
import { frameAt } from "@/features/effects/frame"
import type { Effect } from "@/features/effects/schema"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import { cn } from "@/lib/utils"

const PREVIEW_WIDTH = 270
const NO_EFFECTS: readonly Effect[] = []

function drawPreview(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  layout: LayoutInput,
  effects: readonly Effect[],
  tMs: number
) {
  const context = canvas.getContext("2d")
  if (!context || !video.videoWidth) return
  const scale = canvas.width / OUTPUT_WIDTH
  const { regions } = frameAt(
    layout,
    { width: video.videoWidth, height: video.videoHeight },
    effects,
    tMs
  )
  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (const { crop, dest, blur } of regions) {
    context.filter = blur ? "blur(6px) brightness(0.85)" : "none"
    context.drawImage(
      video,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      dest.x * scale,
      dest.y * scale,
      dest.w * scale,
      dest.h * scale
    )
  }
  context.filter = "none"
}

export function VerticalPreviewCanvas({
  layout,
  effects = NO_EFFECTS,
  className,
  ...props
}: Omit<React.ComponentProps<"canvas">, "width" | "height"> & {
  layout: LayoutInput
  effects?: readonly Effect[]
}) {
  const { videoRef, currentMs } = useVideoPlayer()
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const draw = () => drawPreview(canvas, video, layout, effects, currentMs)
    draw()
    video.addEventListener("loadeddata", draw)
    video.addEventListener("seeked", draw)
    return () => {
      video.removeEventListener("loadeddata", draw)
      video.removeEventListener("seeked", draw)
    }
  }, [videoRef, layout, effects, currentMs])

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_WIDTH}
      height={(PREVIEW_WIDTH * OUTPUT_HEIGHT) / OUTPUT_WIDTH}
      className={cn("aspect-[9/16] w-full bg-black", className)}
      {...props}
    />
  )
}
