"use client"

import { ArrowCounterClockwiseIcon, MagicWandIcon } from "@phosphor-icons/react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useVideoPlayer } from "@/components/ui/video-player"
import { planClipEffectsAction } from "@/features/clips/actions"
import { zoomFocusAt } from "@/features/effects/frame"
import type { ClipEffects, Effect } from "@/features/effects/schema"
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"

import { ClipPreview } from "./clip-preview"
import { EffectsLane } from "./effects-lane"

const NO_EFFECTS: Effect[] = []

export function ClipEffectsCard({
  projectId,
  clipId,
  startMs,
  endMs,
  layoutOverride,
  hasWebcam,
  effects,
  onEffectsChange,
  selected,
  onSelectedChange,
  disabled,
}: {
  projectId: string
  clipId: string
  startMs: number
  endMs: number
  layoutOverride: LayoutInput | null
  hasWebcam: boolean
  effects: ClipEffects | null
  onEffectsChange(effects: ClipEffects): void
  selected: number | null
  onSelectedChange(index: number | null): void
  disabled?: boolean
}) {
  const { currentMs } = useVideoPlayer()
  const [planning, startPlanning] = React.useTransition()

  const plan = () =>
    startPlanning(async () => {
      const planned = await planClipEffectsAction(projectId, clipId, {
        startMs,
        endMs,
        layoutOverride,
      })
      if (!planned.ok) {
        toast.error(planned.error.message)
        return
      }
      onSelectedChange(null)
      onEffectsChange(planned.value)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Effects</CardTitle>
        <CardDescription>
          {effects === null
            ? "No effects yet. Add them at the playhead or plan them from the audio."
            : effects.edited
              ? "Edited by hand. Trimming keeps your effects."
              : "Planned from the audio. Trimming plans them again."}
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || planning}
            onClick={plan}
          >
            {effects === null ? (
              <MagicWandIcon data-icon="inline-start" aria-hidden />
            ) : (
              <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
            )}
            {effects === null ? "Add effects automatically" : "Reset to auto"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <EffectsLane
          startMs={startMs}
          endMs={endMs}
          events={effects?.events ?? NO_EFFECTS}
          hasWebcam={hasWebcam}
          currentMs={currentMs}
          onChange={(events) => onEffectsChange({ events, edited: true })}
          selected={selected}
          onSelectedChange={onSelectedChange}
        />
      </CardContent>
    </Card>
  )
}

export function ClipEffectsPreview({
  source,
  effects,
  selected,
  onEffectsChange,
  ...props
}: Omit<React.ComponentProps<typeof ClipPreview>, "effects"> & {
  source: { width: number; height: number }
  effects: ClipEffects | null
  selected: number | null
  onEffectsChange(effects: ClipEffects): void
}) {
  const { currentMs } = useVideoPlayer()
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
    <div className="relative mx-auto w-full max-w-[260px]">
      <ClipPreview effects={effects?.events} {...props} />
      {selectedEffect?.kind === "zoom" && (
        <button
          type="button"
          aria-label="Set zoom focus"
          data-effect-focus-picker
          className="absolute inset-0 cursor-crosshair rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={setFocus}
        />
      )}
    </div>
  )
}
