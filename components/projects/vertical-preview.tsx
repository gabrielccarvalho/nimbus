"use client"

import * as React from "react"

import { useVideoPlayer } from "@/components/ui/video-player"
import {
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  planLayout,
} from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import { cn } from "@/lib/utils"

const PREVIEW_WIDTH = 270

function drawPreview(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  layout: LayoutInput
) {
  const context = canvas.getContext("2d")
  if (!context || !video.videoWidth) return
  const scale = canvas.width / OUTPUT_WIDTH
  const plan = planLayout(layout, video.videoWidth, video.videoHeight)
  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (plan.mode === "no-cam-blur-fill") {
    const { x, y, w, h } = plan.background
    context.filter = "blur(6px) brightness(0.85)"
    context.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height)
    context.filter = "none"
    const height = plan.foregroundHeight * scale
    context.drawImage(
      video,
      0,
      (canvas.height - height) / 2,
      canvas.width,
      height
    )
    return
  }
  let top = 0
  for (const { crop, outHeight } of plan.regions) {
    const height = outHeight * scale
    context.drawImage(
      video,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      top,
      canvas.width,
      height
    )
    top += height
  }
}

export function VerticalPreviewCanvas({
  layout,
  className,
  ...props
}: Omit<React.ComponentProps<"canvas">, "width" | "height"> & {
  layout: LayoutInput
}) {
  const { videoRef, currentMs } = useVideoPlayer()
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const draw = () => drawPreview(canvas, video, layout)
    draw()
    video.addEventListener("loadeddata", draw)
    video.addEventListener("seeked", draw)
    return () => {
      video.removeEventListener("loadeddata", draw)
      video.removeEventListener("seeked", draw)
    }
  }, [videoRef, layout, currentMs])

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
