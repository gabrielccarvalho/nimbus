"use client"

import * as React from "react"

import { useVideoPlayer } from "@/components/ui/video-player"
import { zoomFocusAt } from "@/features/effects/frame"
import type { ClipEffects } from "@/features/effects/schema"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/features/layout/geometry"
import { useMessages } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

import { ClipPreview } from "./clip-preview"
import { editor } from "./messages/editor"

export function ClipEffectsPreview({
  source,
  effects,
  selected,
  onEffectsChange,
  className,
  previewClassName,
  style,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ClipPreview>, "effects"> & {
  source: { width: number; height: number }
  effects: ClipEffects | null
  selected: number | null
  onEffectsChange(effects: ClipEffects): void
  previewClassName?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const { currentMs } = useVideoPlayer()
  const t = useMessages(editor).stage
  const selectedEffect =
    selected === null ? undefined : effects?.events[selected]

  const setFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!effects || selectedEffect?.kind !== "zoom") return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const focus = zoomFocusAt(props.layout, source, effects.events, currentMs, {
      x: ((event.clientX - rect.left) / rect.width) * OUTPUT_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * OUTPUT_HEIGHT,
    })
    onEffectsChange({
      edited: true,
      events: effects.events.map((effect) =>
        effect === selectedEffect ? { ...selectedEffect, focus } : effect
      ),
    })
  }

  return (
    <div
      className={cn("relative mx-auto w-full max-w-[260px]", className)}
      style={style}
    >
      <ClipPreview
        effects={effects?.events}
        className={previewClassName}
        {...props}
      />
      {children}
      {selectedEffect?.kind === "zoom" && (
        <button
          type="button"
          aria-label={t.zoomFocus}
          data-effect-focus-picker
          className="absolute inset-0 cursor-crosshair rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={setFocus}
        />
      )}
    </div>
  )
}
