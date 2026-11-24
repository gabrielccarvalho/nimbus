"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { TimelineBlock, TimelineTrack } from "@/components/ui/timeline-track"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { normalizeEffects, type Effect } from "@/features/effects/schema"
import { formatTimestamp } from "@/lib/format"

export const EFFECT_FOCUS_PICKER = "data-effect-focus-picker"

const ROWS = [
  {
    kind: "focus",
    label: "Full cam",
    lengthMs: 2000,
    className: "border-chart-4 bg-chart-4/30",
  },
  { kind: "zoom", label: "Zoom", lengthMs: 1500, className: undefined },
  {
    kind: "shake",
    label: "Shake",
    lengthMs: 500,
    className: "border-chart-5 bg-chart-5/30",
  },
] as const satisfies {
  kind: Effect["kind"]
  label: string
  lengthMs: number
  className: string | undefined
}[]

const SHAKE_INTENSITIES = [
  { value: "light", label: "Light" },
  { value: "strong", label: "Strong" },
] as const

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function createEffect(
  kind: Effect["kind"],
  startMs: number,
  endMs: number
): Effect {
  if (kind === "zoom") {
    return { kind, startMs, endMs, scale: 1.4, focus: { x: 0.5, y: 0.5 } }
  }
  if (kind === "shake") return { kind, startMs, endMs, intensity: "light" }
  return { kind, startMs, endMs }
}

function effectLabel(effect: Effect) {
  if (effect.kind === "zoom") return `Zoom ${effect.scale}×`
  if (effect.kind === "shake") return `Shake ${effect.intensity}`
  return "Full cam"
}

function blockText(effect: Effect) {
  if (effect.kind === "zoom") return `${effect.scale}×`
  if (effect.kind === "focus") return "Cam"
  return null
}

function moveWithin(
  events: readonly Effect[],
  index: number,
  range: { startMs: number; endMs: number },
  startMs: number,
  endMs: number
): Effect[] | undefined {
  const event = events[index]!
  const others = events.filter((o, i) => i !== index && o.kind === event.kind)
  const lo = Math.max(
    range.startMs,
    ...others.filter((o) => o.endMs <= event.startMs).map((o) => o.endMs)
  )
  const hi = Math.min(
    range.endMs,
    ...others.filter((o) => o.startMs >= event.endMs).map((o) => o.startMs)
  )
  const length = endMs - startMs
  const moving = length === event.endMs - event.startMs
  if (moving && hi - lo < length) return undefined
  const nextStart = moving
    ? clamp(startMs, lo, hi - length)
    : Math.max(startMs, lo)
  const nextEnd = moving ? nextStart + length : Math.min(endMs, hi)
  if (nextEnd <= nextStart) return undefined
  return events.map((o, i) =>
    i === index ? { ...o, startMs: nextStart, endMs: nextEnd } : o
  )
}

export function EffectsLane({
  startMs,
  endMs,
  events,
  hasWebcam,
  currentMs,
  onChange,
  selected: selectedProp,
  onSelectedChange,
}: {
  startMs: number
  endMs: number
  events: Effect[]
  hasWebcam: boolean
  currentMs: number
  onChange(events: Effect[]): void
  selected?: number | null
  onSelectedChange?(index: number | null): void
}) {
  const id = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const [ownSelected, setOwnSelected] = React.useState<number | null>(null)
  const selectedIndex = selectedProp !== undefined ? selectedProp : ownSelected
  const selected = selectedIndex === null ? undefined : events[selectedIndex]
  const range = { startMs, endMs }
  const durationMs = Math.max(0, endMs - startMs)

  const select = (index: number | null) => {
    setOwnSelected(index)
    onSelectedChange?.(index)
  }
  const replace = (index: number, effect: Effect) =>
    onChange(events.map((event, i) => (i === index ? effect : event)))
  const remove = (index: number) => {
    select(null)
    onChange(events.filter((_, i) => i !== index))
  }
  const add = (kind: Effect["kind"], lengthMs: number) => {
    const start = Math.round(
      clamp(currentMs, startMs, Math.max(startMs, endMs - lengthMs))
    )
    const next = normalizeEffects(
      [...events, createEffect(kind, start, start + lengthMs)],
      range
    )
    const index = next.findIndex(
      (event) => event.kind === kind && event.endMs === start + lengthMs
    )
    select(index === -1 ? null : index)
    onChange(next)
  }

  return (
    <div ref={rootRef} data-slot="effects-lane" className="flex flex-col gap-2">
      {ROWS.map((row) => (
        <div key={row.kind} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">
            {row.label}
          </span>
          <TimelineTrack
            aria-label={row.label}
            durationMs={durationMs}
            className="h-7"
          >
            {events.map((event, index) => {
              if (event.kind !== row.kind) return null
              if (event.endMs <= startMs || event.startMs >= endMs) return null
              const disabled = event.kind === "focus" && !hasWebcam
              const block = (
                <TimelineBlock
                  key={index}
                  ref={index === selectedIndex ? anchorRef : undefined}
                  aria-label={`${effectLabel(event)} at ${formatTimestamp(event.startMs - startMs)}`}
                  startMs={event.startMs - startMs}
                  endMs={event.endMs - startMs}
                  variant={disabled ? "muted" : "default"}
                  className={disabled ? undefined : row.className}
                  selected={index === selectedIndex}
                  onSelect={() => select(index)}
                  onDelete={() => remove(index)}
                  onChange={(start, end) => {
                    const next = moveWithin(
                      events,
                      index,
                      range,
                      start + startMs,
                      end + startMs
                    )
                    if (next) onChange(next)
                  }}
                >
                  {blockText(event)}
                </TimelineBlock>
              )
              if (!disabled) return block
              return (
                <Tooltip key={index}>
                  <TooltipTrigger render={block} />
                  <TooltipContent>No webcam in this layout</TooltipContent>
                </Tooltip>
              )
            })}
            {currentMs >= startMs && currentMs <= endMs && durationMs > 0 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
                style={{
                  left: `${((currentMs - startMs) / durationMs) * 100}%`,
                }}
              />
            )}
          </TimelineTrack>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Add at playhead</span>
        {ROWS.map((row) => (
          <Button
            key={row.kind}
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Add ${row.label.toLowerCase()}`}
            disabled={row.kind === "focus" && !hasWebcam}
            onClick={() => add(row.kind, row.lengthMs)}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            {row.label}
          </Button>
        ))}
      </div>
      <Popover
        open={selected !== undefined}
        onOpenChange={(open, details) => {
          if (open) return
          const target = details.event?.target
          if (
            details.reason === "outside-press" &&
            target instanceof Element &&
            (rootRef.current?.contains(target) ||
              target.closest(`[${EFFECT_FOCUS_PICKER}]`))
          ) {
            return
          }
          select(null)
        }}
      >
        {selected && selectedIndex !== null && (
          <PopoverContent
            anchor={anchorRef}
            initialFocus={false}
            finalFocus={false}
            className="w-60"
          >
            <PopoverHeader>
              <PopoverTitle>
                {ROWS.find((row) => row.kind === selected.kind)?.label}
              </PopoverTitle>
              {selected.kind === "zoom" && (
                <PopoverDescription>
                  Click the preview to set the focus point.
                </PopoverDescription>
              )}
              {selected.kind === "focus" && !hasWebcam && (
                <PopoverDescription>
                  No webcam in this layout
                </PopoverDescription>
              )}
            </PopoverHeader>
            {selected.kind === "zoom" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label id={`${id}-scale`}>Scale</Label>
                  <span className="font-mono text-xs tabular-nums">
                    {selected.scale}×
                  </span>
                </div>
                <Slider
                  aria-labelledby={`${id}-scale`}
                  min={1.1}
                  max={2}
                  step={0.1}
                  value={[selected.scale]}
                  onValueChange={(next) => {
                    const scale = typeof next === "number" ? next : next[0]
                    if (scale !== undefined) {
                      replace(selectedIndex, {
                        ...selected,
                        scale: Math.round(scale * 10) / 10,
                      })
                    }
                  }}
                />
              </div>
            )}
            {selected.kind === "shake" && (
              <div className="flex flex-col gap-2">
                <Label id={`${id}-intensity`}>Intensity</Label>
                <ToggleGroup
                  aria-labelledby={`${id}-intensity`}
                  variant="outline"
                  size="sm"
                  value={[selected.intensity]}
                  onValueChange={(value) => {
                    const intensity = SHAKE_INTENSITIES.find(
                      (option) => option.value === value[0]
                    )?.value
                    if (intensity)
                      replace(selectedIndex, { ...selected, intensity })
                  }}
                >
                  {SHAKE_INTENSITIES.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => remove(selectedIndex)}
            >
              <TrashIcon data-icon="inline-start" aria-hidden />
              Delete
            </Button>
          </PopoverContent>
        )}
      </Popover>
    </div>
  )
}
