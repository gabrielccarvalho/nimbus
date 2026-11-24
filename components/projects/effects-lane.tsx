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
import { MIN_EFFECT_MS, type Effect } from "@/features/effects/schema"
import { formatTimestamp } from "@/lib/format"

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

type Range = { startMs: number; endMs: number }

function freeGap(
  events: readonly Effect[],
  kind: Effect["kind"],
  range: Range,
  around: Range,
  skip?: number
): Range | undefined {
  const others = events.filter((o, i) => i !== skip && o.kind === kind)
  if (others.some((o) => o.startMs < around.endMs && o.endMs > around.startMs))
    return undefined
  return {
    startMs: Math.max(
      range.startMs,
      ...others.filter((o) => o.endMs <= around.startMs).map((o) => o.endMs)
    ),
    endMs: Math.min(
      range.endMs,
      ...others.filter((o) => o.startMs >= around.endMs).map((o) => o.startMs)
    ),
  }
}

function moveWithin(
  events: readonly Effect[],
  index: number,
  range: Range,
  next: Range,
  moving: boolean
): Effect[] | undefined {
  const event = events[index]!
  const gap = freeGap(events, event.kind, range, event, index)
  if (!gap) return undefined
  const length = next.endMs - next.startMs
  if (moving && gap.endMs - gap.startMs < length) return undefined
  const startMs = moving
    ? clamp(next.startMs, gap.startMs, gap.endMs - length)
    : Math.max(next.startMs, gap.startMs)
  const endMs = moving ? startMs + length : Math.min(next.endMs, gap.endMs)
  if (endMs - startMs < MIN_EFFECT_MS) return undefined
  return events.map((o, i) => (i === index ? { ...o, startMs, endMs } : o))
}

function placeAt(
  events: readonly Effect[],
  kind: Effect["kind"],
  range: Range,
  atMs: number,
  lengthMs: number
): Range | undefined {
  const at = clamp(Math.round(atMs), range.startMs, range.endMs)
  const gap = freeGap(events, kind, range, { startMs: at, endMs: at })
  if (!gap || gap.endMs - gap.startMs < MIN_EFFECT_MS) return undefined
  const length = Math.min(lengthMs, gap.endMs - gap.startMs)
  const startMs = clamp(at, gap.startMs, gap.endMs - length)
  return { startMs, endMs: startMs + length }
}

// Base UI parks a portaled popup's tab stops at tabindex -1 (original in
// data-tabindex) while focus is outside it.
function tabIndexOf(element: HTMLElement) {
  const original = element.getAttribute("data-tabindex")
  if (original === null) return element.tabIndex
  return original === "" ? 0 : Number(original)
}

function tabbables(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>("button, input, [tabindex]") ?? []
  ).filter(
    (element) => tabIndexOf(element) >= 0 && !element.matches(":disabled")
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
  const popupRef = React.useRef<HTMLDivElement>(null)
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
  const add = (kind: Effect["kind"], placed: Range) => {
    select(events.length)
    onChange([...events, createEffect(kind, placed.startMs, placed.endMs)])
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
              const shownStart = Math.max(event.startMs, startMs) - startMs
              const shownEnd = Math.min(event.endMs, endMs) - startMs
              const disabled = event.kind === "focus" && !hasWebcam
              const block = (
                <TimelineBlock
                  key={index}
                  ref={index === selectedIndex ? anchorRef : undefined}
                  aria-label={`${effectLabel(event)} at ${formatTimestamp(event.startMs - startMs)}`}
                  startMs={shownStart}
                  endMs={shownEnd}
                  variant={disabled ? "muted" : "default"}
                  className={disabled ? undefined : row.className}
                  selected={index === selectedIndex}
                  onSelect={() => select(index)}
                  onDelete={() => remove(index)}
                  onKeyDown={(keyEvent) => {
                    if (index !== selectedIndex) return
                    if (keyEvent.key !== "Tab" || keyEvent.shiftKey) return
                    const first = tabbables(popupRef.current)[0]
                    if (!first) return
                    keyEvent.preventDefault()
                    first.focus()
                  }}
                  onChange={(start, end) => {
                    const moving = start - shownStart === end - shownEnd
                    const next = moveWithin(
                      events,
                      index,
                      range,
                      {
                        startMs:
                          start === shownStart
                            ? event.startMs
                            : event.startMs + start - shownStart,
                        endMs:
                          end === shownEnd
                            ? event.endMs
                            : event.endMs + end - shownEnd,
                      },
                      moving
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
        {ROWS.map((row) => {
          const placed = placeAt(
            events,
            row.kind,
            range,
            currentMs,
            row.lengthMs
          )
          return (
            <Button
              key={row.kind}
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Add ${row.label.toLowerCase()}`}
              disabled={!placed || (row.kind === "focus" && !hasWebcam)}
              onClick={() => placed && add(row.kind, placed)}
            >
              <PlusIcon data-icon="inline-start" aria-hidden />
              {row.label}
            </Button>
          )
        })}
      </div>
      <Popover
        open={selected !== undefined}
        onOpenChange={(open, details) => {
          if (open) return
          const target =
            details.event instanceof FocusEvent
              ? details.event.relatedTarget
              : details.event?.target
          if (
            (details.reason === "outside-press" ||
              details.reason === "focus-out") &&
            target instanceof Element &&
            (rootRef.current?.contains(target) ||
              target.closest("[data-effect-focus-picker]"))
          ) {
            return
          }
          select(null)
        }}
      >
        {selected && selectedIndex !== null && (
          <PopoverContent
            ref={popupRef}
            anchor={anchorRef}
            initialFocus={false}
            finalFocus={false}
            className="w-60"
            onKeyDown={(event) => {
              const anchor = anchorRef.current
              if (!anchor) return
              if (event.key === "Escape") {
                anchor.focus()
                return
              }
              if (event.key !== "Tab") return
              const items = tabbables(popupRef.current)
              if (event.target !== (event.shiftKey ? items[0] : items.at(-1)))
                return
              if (event.shiftKey) event.preventDefault()
              anchor.focus()
            }}
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
