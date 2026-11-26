"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

type TimelineTrackContextValue = {
  durationMs: number
  trackRef: React.RefObject<HTMLDivElement | null>
}

const TimelineTrackContext =
  React.createContext<TimelineTrackContextValue | null>(null)

function useTimelineTrack() {
  const context = React.useContext(TimelineTrackContext)
  if (!context) {
    throw new Error("useTimelineTrack must be used within <TimelineTrack>")
  }
  return context
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function TimelineTrack({
  className,
  durationMs,
  lane,
  group,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  durationMs: number
  lane?: string
  group?: string
}) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const context = React.useMemo(() => ({ durationMs, trackRef }), [durationMs])
  return (
    <TimelineTrackContext.Provider value={context}>
      <div
        ref={trackRef}
        data-slot="timeline-track"
        data-lane={lane}
        data-lane-group={group}
        role="group"
        className={cn(
          "relative h-8 w-full overflow-hidden rounded-lg bg-muted select-none",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </TimelineTrackContext.Provider>
  )
}

const timelineBlockVariants = cva(
  "absolute inset-y-1 flex touch-none items-center overflow-hidden rounded-md border px-2 text-[10px] leading-none font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[selected]:ring-2 data-[selected]:ring-ring",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary/30 text-foreground",
        muted: "border-border bg-foreground/10 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

type DragMode = "move" | "start" | "end"

function lanesOf(track: HTMLElement | null) {
  const group = track?.dataset.laneGroup
  if (!track || !group) return []
  return Array.from(
    track.ownerDocument.querySelectorAll<HTMLElement>(
      `[data-slot=timeline-track][data-lane-group="${CSS.escape(group)}"]`
    )
  )
}

function laneAt(track: HTMLElement | null, clientY: number) {
  return lanesOf(track).find((lane) => {
    const rect = lane.getBoundingClientRect()
    return clientY >= rect.top && clientY < rect.bottom
  })
}

function TimelineBlock({
  className,
  startMs,
  endMs,
  onChange,
  onCommit,
  onLaneChange,
  onSelect,
  onDelete,
  minMs = 100,
  stepMs = 100,
  selected = false,
  resizable = true,
  variant = "default",
  style,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange" | "onSelect"> &
  VariantProps<typeof timelineBlockVariants> & {
    startMs: number
    endMs: number
    onChange: (startMs: number, endMs: number) => void
    onCommit?: () => void
    onLaneChange?: (lane: string, startMs: number, endMs: number) => void
    onSelect?: () => void
    onDelete?: () => void
    minMs?: number
    stepMs?: number
    selected?: boolean
    resizable?: boolean
  }) {
  const { durationMs, trackRef } = useTimelineTrack()
  const drag = React.useRef<{
    mode: DragMode
    startX: number
    startMs: number
    endMs: number
  } | null>(null)
  const [drop, setDrop] = React.useState<{
    lane: HTMLElement
    offsetX: number
    offsetY: number
    startMs: number
  } | null>(null)

  const finish = () => {
    const dropped = drop
    drag.current = null
    setDrop(null)
    onCommit?.()
    const lane = dropped?.lane.dataset.lane
    if (dropped && lane !== undefined && dropped.lane !== trackRef.current)
      onLaneChange?.(lane, dropped.startMs, dropped.startMs + endMs - startMs)
  }

  const toPercent = (ms: number) =>
    durationMs > 0 ? clamp((ms / durationMs) * 100, 0, 100) : 0
  const left = toPercent(startMs)

  const commit = (nextStart: number, nextEnd: number) => {
    const start = Math.round(nextStart)
    const end = Math.round(nextEnd)
    if (start !== startMs || end !== endMs) onChange(start, end)
  }
  const moveTo = (start: number, length: number) => {
    const clamped = clamp(start, 0, Math.max(0, durationMs - length))
    commit(clamped, clamped + length)
  }
  const resizeStart = (start: number, end: number) =>
    commit(clamp(start, 0, end - minMs), end)
  const resizeEnd = (start: number, end: number) =>
    commit(start, clamp(end, start + minMs, durationMs))

  return (
    <div
      data-slot="timeline-block"
      data-variant={variant}
      data-selected={selected || undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={cn(
        timelineBlockVariants({ variant }),
        "cursor-grab active:cursor-grabbing",
        className
      )}
      data-dragging={drop ? "" : undefined}
      style={{
        left: `${left}%`,
        width: `${Math.max(0, toPercent(endMs) - left)}%`,
        ...(drop
          ? {
              transform: `translate(${drop.offsetX}px, ${drop.offsetY}px)`,
              zIndex: 10,
            }
          : {}),
        ...style,
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (event.defaultPrevented || event.button !== 0) return
        event.stopPropagation()
        const edge = (event.target as HTMLElement).dataset.edge
        event.currentTarget.setPointerCapture?.(event.pointerId)
        drag.current = {
          mode: edge === "start" || edge === "end" ? edge : "move",
          startX: event.clientX,
          startMs,
          endMs,
        }
        onSelect?.()
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        const current = drag.current
        const rect = trackRef.current?.getBoundingClientRect()
        if (!current || !rect || rect.width === 0) return
        const delta =
          ((event.clientX - current.startX) / rect.width) * durationMs
        if (current.mode === "move") {
          moveTo(current.startMs + delta, current.endMs - current.startMs)
          if (onLaneChange) {
            const lane = laneAt(trackRef.current, event.clientY)
            const own = trackRef.current!.getBoundingClientRect()
            const length = current.endMs - current.startMs
            const dropStart = Math.round(
              clamp(
                current.startMs + delta,
                0,
                Math.max(0, durationMs - length)
              )
            )
            setDrop(
              lane && lane !== trackRef.current
                ? {
                    lane,
                    offsetX: ((dropStart - startMs) / durationMs) * own.width,
                    offsetY: lane.getBoundingClientRect().top - own.top,
                    startMs: dropStart,
                  }
                : null
            )
          }
        } else if (current.mode === "start") {
          resizeStart(current.startMs + delta, current.endMs)
        } else {
          resizeEnd(current.startMs, current.endMs + delta)
        }
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        if (drag.current) finish()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        drag.current = null
        setDrop(null)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === "Delete" || event.key === "Backspace") {
          if (!onDelete) return
          event.preventDefault()
          onDelete()
        } else if (
          event.altKey &&
          onLaneChange &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault()
          const lanes = lanesOf(trackRef.current)
          const at = lanes.indexOf(trackRef.current!)
          const next = lanes[at + (event.key === "ArrowUp" ? -1 : 1)]
          if (next?.dataset.lane !== undefined)
            onLaneChange(next.dataset.lane, startMs, endMs)
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          const direction = event.key === "ArrowLeft" ? -1 : 1
          if (event.shiftKey) {
            if (resizable) resizeEnd(startMs, endMs + direction * stepMs)
          } else {
            moveTo(startMs + direction * stepMs, endMs - startMs)
          }
          onCommit?.()
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect?.()
        }
      }}
      {...props}
    >
      {resizable && (
        <span
          data-edge="start"
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
        />
      )}
      <span className="pointer-events-none truncate">{children}</span>
      {resizable && (
        <span
          data-edge="end"
          aria-hidden
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
        />
      )}
    </div>
  )
}

export { TimelineBlock, TimelineTrack, timelineBlockVariants, useTimelineTrack }
