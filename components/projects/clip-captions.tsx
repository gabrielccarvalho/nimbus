"use client"

import {
  ArrowCounterClockwiseIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { TimelineBlock, TimelineTrack } from "@/components/ui/timeline-track"
import { useVideoPlayer } from "@/components/ui/video-player"
import {
  pageRoom,
  type CaptionPage,
  type PageOverride,
} from "@/features/captions/pages"
import { CAPTION_MAX_OFFSET_MS } from "@/features/clips/schema"
import { formatTimestamp } from "@/lib/format"

import { tabbables } from "./effects-lane"

export type PageEdits = Record<number, Omit<PageOverride, "index">>

const MIN_PAGE_MS = 200
const OFFSET_STEP_MS = 100
const ZOOM_LEVELS = [0, 50, 100, 200, 400] as const
const DEFAULT_ZOOM = 2
const TICK_STEPS_MS = [500, 1000, 2000, 5000, 10_000, 30_000, 60_000]
const MIN_TICK_PX = 64

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const pageText = (page: CaptionPage) => page.words.map((w) => w.text).join(" ")

export function rulerTicks(durationMs: number, widthPx: number): number[] {
  if (durationMs <= 0 || widthPx <= 0) return []
  const pxPerMs = widthPx / durationMs
  const step =
    TICK_STEPS_MS.find((ms) => ms * pxPerMs >= MIN_TICK_PX) ??
    TICK_STEPS_MS.at(-1)!
  return Array.from(
    { length: Math.floor(durationMs / step) + 1 },
    (_, i) => i * step
  )
}

function formatOffset(ms: number) {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : ""
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)} s`
}

export function ClipCaptionsCard({
  startMs,
  durationMs,
  basePages,
  pages,
  enabled,
  onEnabledChange,
  pageEdits,
  onPageEditsChange,
  offsetMs,
  onOffsetChange,
  disabled,
}: {
  startMs: number
  durationMs: number
  basePages: readonly CaptionPage[]
  pages: readonly CaptionPage[]
  enabled: boolean
  onEnabledChange(enabled: boolean): void
  pageEdits: PageEdits
  onPageEditsChange(edits: PageEdits): void
  offsetMs: number
  onOffsetChange(offsetMs: number): void
  disabled?: boolean
}) {
  const id = React.useId()
  const { currentMs, seek } = useVideoPlayer()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM)
  const [laneWidth, setLaneWidth] = React.useState(0)
  const pxPerSecond = ZOOM_LEVELS[zoom]!
  const rootRef = React.useRef<HTMLDivElement>(null)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const shown = pages.find((page) => page.index === selectedIndex)
  const selected =
    shown ?? basePages.find((page) => page.index === selectedIndex)
  const playheadMs = currentMs - startMs
  const ticks = rulerTicks(durationMs, laneWidth)

  React.useEffect(() => {
    const scroller = scrollRef.current
    const lane = scroller?.firstElementChild
    if (!lane) return
    const observer = new ResizeObserver(() =>
      setLaneWidth(lane.getBoundingClientRect().width)
    )
    observer.observe(lane)
    return () => observer.disconnect()
  }, [enabled, basePages.length])

  React.useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || durationMs <= 0) return
    if (playheadMs < 0 || playheadMs > durationMs) return
    const x = (playheadMs / durationMs) * scroller.scrollWidth
    const { scrollLeft, clientWidth } = scroller
    if (x < scrollLeft || x > scrollLeft + clientWidth - 24) {
      scroller.scrollLeft = x - clientWidth / 4
    }
  }, [playheadMs, durationMs, zoom])
  const edited = offsetMs !== 0 || Object.keys(pageEdits).length > 0

  const edit = (index: number, patch: Omit<PageOverride, "index">) =>
    onPageEditsChange({
      ...pageEdits,
      [index]: { ...pageEdits[index], ...patch },
    })
  const reset = (index: number) => {
    const next = { ...pageEdits }
    delete next[index]
    onPageEditsChange(next)
  }
  const remove = (index: number) => {
    setSelectedIndex(null)
    edit(index, { text: "" })
  }
  const retime = (page: CaptionPage, start: number, end: number) => {
    const room = pageRoom(pages, page.index, durationMs)
    const length = page.endMs - page.startMs
    const moving = end - start === length
    const nextStart = moving
      ? clamp(start, room.minMs, room.maxMs - length)
      : Math.max(start, room.minMs)
    const nextEnd = moving ? nextStart + length : Math.min(end, room.maxMs)
    if (nextEnd - nextStart < MIN_PAGE_MS) return
    edit(page.index, {
      startMs: Math.max(0, nextStart - offsetMs),
      endMs: Math.max(1, nextEnd - offsetMs),
    })
  }
  const shift = (delta: number) =>
    onOffsetChange(
      clamp(offsetMs + delta, -CAPTION_MAX_OFFSET_MS, CAPTION_MAX_OFFSET_MS)
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Captions</CardTitle>
        <CardDescription>
          {!enabled
            ? "Captions are off for this clip."
            : "Drag a caption to re-time it, or click it to edit the text. Trimming resets caption edits."}
        </CardDescription>
        <CardAction className="flex items-center gap-3">
          {enabled && edited && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setSelectedIndex(null)
                onPageEditsChange({})
                onOffsetChange(0)
              }}
            >
              <ArrowCounterClockwiseIcon data-icon="inline-start" aria-hidden />
              Reset edits
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-enabled`}
              checked={enabled}
              disabled={disabled}
              onCheckedChange={(checked) => {
                setSelectedIndex(null)
                onEnabledChange(checked)
              }}
            />
            <Label htmlFor={`${id}-enabled`}>Show captions on this clip</Label>
          </div>
        </CardAction>
      </CardHeader>
      {enabled && (
        <CardContent>
          <div
            ref={rootRef}
            data-slot="captions-lane"
            className="flex flex-col gap-3"
          >
            {basePages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No speech in this clip.
              </p>
            ) : (
              <div
                ref={scrollRef}
                data-testid="captions-scroller"
                className="overflow-x-auto overscroll-x-contain rounded-lg pb-1"
              >
                <div
                  style={{
                    width:
                      pxPerSecond === 0
                        ? "100%"
                        : `max(100%, ${(durationMs / 1000) * pxPerSecond}px)`,
                  }}
                >
                  <div
                    role="presentation"
                    className="relative h-5 cursor-pointer rounded-t-lg bg-muted/50 select-none"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      if (rect.width === 0) return
                      seek(
                        startMs +
                          ((event.clientX - rect.left) / rect.width) *
                            durationMs
                      )
                    }}
                  >
                    {ticks.map((ms) => (
                      <span
                        key={ms}
                        aria-hidden
                        className="absolute inset-y-0 border-l border-hair pl-1 font-mono text-[10px] leading-5 text-muted-foreground tabular-nums"
                        style={{ left: `${(ms / durationMs) * 100}%` }}
                      >
                        {formatTimestamp(ms)}
                      </span>
                    ))}
                  </div>
                  <TimelineTrack
                    aria-label="Caption timing"
                    durationMs={durationMs}
                    className="h-11 rounded-t-none"
                  >
                    {pages.map((page) => (
                      <TimelineBlock
                        key={page.index}
                        ref={
                          page.index === selectedIndex ? anchorRef : undefined
                        }
                        aria-label={`Caption ${page.index + 1} at ${formatTimestamp(page.startMs)}: ${pageText(page)}`}
                        startMs={page.startMs}
                        endMs={page.endMs}
                        minMs={MIN_PAGE_MS}
                        className={
                          pageEdits[page.index]
                            ? "border-lav bg-lav/25"
                            : "border-chart-2 bg-chart-2/25"
                        }
                        selected={page.index === selectedIndex}
                        onSelect={() => setSelectedIndex(page.index)}
                        onDelete={() => remove(page.index)}
                        onKeyDown={(keyEvent) => {
                          if (page.index !== selectedIndex) return
                          if (keyEvent.key !== "Tab" || keyEvent.shiftKey)
                            return
                          const first = tabbables(popupRef.current)[0]
                          if (!first) return
                          keyEvent.preventDefault()
                          first.focus()
                        }}
                        onChange={(start, end) => retime(page, start, end)}
                      >
                        {pageText(page)}
                      </TimelineBlock>
                    ))}
                    {playheadMs >= 0 && playheadMs <= durationMs && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
                        style={{ left: `${(playheadMs / durationMs) * 100}%` }}
                      />
                    )}
                  </TimelineTrack>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  id={`${id}-offset`}
                  className="text-xs text-muted-foreground"
                >
                  Shift all captions
                </span>
                <div
                  role="group"
                  aria-labelledby={`${id}-offset`}
                  className="flex items-center gap-1"
                >
                  <Button
                    type="button"
                    size="icon-sm"
                    aria-label="Show captions earlier"
                    disabled={disabled || offsetMs <= -CAPTION_MAX_OFFSET_MS}
                    onClick={() => shift(-OFFSET_STEP_MS)}
                  >
                    <MinusIcon aria-hidden />
                  </Button>
                  <output
                    aria-live="polite"
                    className="w-14 text-center font-mono text-xs tabular-nums"
                  >
                    {formatOffset(offsetMs)}
                  </output>
                  <Button
                    type="button"
                    size="icon-sm"
                    aria-label="Show captions later"
                    disabled={disabled || offsetMs >= CAPTION_MAX_OFFSET_MS}
                    onClick={() => shift(OFFSET_STEP_MS)}
                  >
                    <PlusIcon aria-hidden />
                  </Button>
                </div>
              </div>
              {basePages.length > 0 && (
                <div
                  role="group"
                  aria-label="Timeline zoom"
                  className="flex items-center gap-1"
                >
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Zoom out"
                    disabled={zoom === 0}
                    onClick={() => setZoom(zoom - 1)}
                  >
                    <MagnifyingGlassMinusIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={zoom === 0}
                    onClick={() => setZoom(0)}
                  >
                    Fit
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Zoom in"
                    disabled={zoom === ZOOM_LEVELS.length - 1}
                    onClick={() => setZoom(zoom + 1)}
                  >
                    <MagnifyingGlassPlusIcon aria-hidden />
                  </Button>
                </div>
              )}
            </div>
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
                rootRef.current?.contains(target)
              ) {
                return
              }
              setSelectedIndex(null)
            }}
          >
            {selected && (
              <PopoverContent
                ref={popupRef}
                anchor={shown ? anchorRef : rootRef}
                initialFocus={false}
                finalFocus={false}
                className="w-72"
                onKeyDown={(event) => {
                  const anchor = anchorRef.current
                  if (!anchor) return
                  if (event.key === "Escape") {
                    anchor.focus()
                    return
                  }
                  if (event.key !== "Tab") return
                  const items = tabbables(popupRef.current)
                  if (
                    event.target !== (event.shiftKey ? items[0] : items.at(-1))
                  )
                    return
                  if (event.shiftKey) event.preventDefault()
                  anchor.focus()
                }}
              >
                <PopoverHeader>
                  <PopoverTitle>Caption {selected.index + 1}</PopoverTitle>
                  <PopoverDescription className="font-mono tabular-nums">
                    {formatTimestamp(selected.startMs)} →{" "}
                    {formatTimestamp(selected.endMs)}
                  </PopoverDescription>
                </PopoverHeader>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-text`}>Caption text</Label>
                  <Input
                    id={`${id}-text`}
                    value={
                      pageEdits[selected.index]?.text ?? pageText(selected)
                    }
                    maxLength={200}
                    onChange={(event) =>
                      edit(selected.index, { text: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {pageEdits[selected.index] && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => reset(selected.index)}
                    >
                      <ArrowCounterClockwiseIcon
                        data-icon="inline-start"
                        aria-hidden
                      />
                      Reset caption
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => remove(selected.index)}
                  >
                    <TrashIcon data-icon="inline-start" aria-hidden />
                    Delete
                  </Button>
                </div>
              </PopoverContent>
            )}
          </Popover>
        </CardContent>
      )}
    </Card>
  )
}
