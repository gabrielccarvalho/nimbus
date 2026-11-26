"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

import { toneVariants, type Tone } from "@/components/ui/tone"

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
  "absolute flex touch-none items-center overflow-hidden text-[11.5px] leading-none font-semibold outline-none focus-visible:focus-ring",
  {
    variants: {
      variant: {
        default:
          "inset-y-[5px] rounded-[7px] bg-white/10 px-2 text-foreground inset-ring-1 inset-ring-white/22 data-[selected]:inset-ring-[1.5px] data-[selected]:inset-ring-lav",
        muted:
          "inset-y-[5px] rounded-[7px] bg-white/5 px-2 text-muted-foreground inset-ring-1 inset-ring-hair data-[selected]:inset-ring-[1.5px] data-[selected]:inset-ring-lav",
        tone: "inset-y-[5px] rounded-[7px] bg-[rgb(var(--tone)/0.16)] px-2 text-[rgb(var(--tone))] inset-ring-1 inset-ring-[rgb(var(--tone)/0.55)] data-[selected]:bg-[rgb(var(--tone)/0.24)] data-[selected]:inset-ring-[1.5px] data-[selected]:inset-ring-[rgb(var(--tone))]",
        clip: "inset-y-0.5 rounded-[9px] px-4 text-foreground inset-ring-2 inset-ring-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

const SNAP_PX = 6

function snapTo(value: number, points: readonly number[], withinMs: number) {
  let best: number | null = null
  for (const point of points) {
    const distance = Math.abs(point - value)
    if (
      distance <= withinMs &&
      (best === null || distance < Math.abs(best - value))
    )
      best = point
  }
  return best
}

type DragMode = "move" | "start" | "end"

function Grip() {
  return (
    <i className="pointer-events-none h-3.5 w-0.5 rounded-[1px] bg-night" />
  )
}

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
  tone,
  snapMs,
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
    tone?: Tone
    snapMs?: readonly number[]
  }) {
  const { durationMs, trackRef } = useTimelineTrack()
  const drag = React.useRef<{
    mode: DragMode
    startX: number
    startMs: number
    endMs: number
    snaps: readonly number[]
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
        tone && toneVariants({ tone }),
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
          snaps: (snapMs ?? []).filter(
            (point) => point !== startMs && point !== endMs
          ),
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
        const withinMs = (SNAP_PX / rect.width) * durationMs
        const length = current.endMs - current.startMs
        if (current.mode === "move") {
          const raw = current.startMs + delta
          const atStart = snapTo(raw, current.snaps, withinMs)
          const atEnd = snapTo(raw + length, current.snaps, withinMs)
          const snapped =
            atStart !== null &&
            (atEnd === null ||
              Math.abs(atStart - raw) <= Math.abs(atEnd - raw - length))
              ? atStart
              : atEnd !== null
                ? atEnd - length
                : raw
          moveTo(snapped, length)
          if (onLaneChange) {
            const lane = laneAt(trackRef.current, event.clientY)
            const own = trackRef.current!.getBoundingClientRect()
            const dropStart = Math.round(
              clamp(snapped, 0, Math.max(0, durationMs - length))
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
          const raw = current.startMs + delta
          resizeStart(
            snapTo(raw, current.snaps, withinMs) ?? raw,
            current.endMs
          )
        } else {
          const raw = current.endMs + delta
          resizeEnd(
            current.startMs,
            snapTo(raw, current.snaps, withinMs) ?? raw
          )
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
          className={cn(
            "absolute inset-y-0 left-0 cursor-ew-resize",
            variant === "clip"
              ? "grid w-2.5 place-items-center rounded-l-[9px] bg-foreground"
              : "w-1.5"
          )}
        >
          {variant === "clip" && <Grip />}
        </span>
      )}
      <span className="pointer-events-none truncate">{children}</span>
      {resizable && (
        <span
          data-edge="end"
          aria-hidden
          className={cn(
            "absolute inset-y-0 right-0 cursor-ew-resize",
            variant === "clip"
              ? "grid w-2.5 place-items-center rounded-r-[9px] bg-foreground"
              : "w-1.5"
          )}
        >
          {variant === "clip" && <Grip />}
        </span>
      )}
    </div>
  )
}

export { TimelineBlock, TimelineTrack, timelineBlockVariants, useTimelineTrack }
