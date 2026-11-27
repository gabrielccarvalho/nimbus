"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

import { ui } from "@/components/ui/messages"
import { useMessages } from "@/lib/i18n/client"

type TimelineContextValue = {
  durationMs: number
  value: number
  toPercent: (ms: number) => number
}

const TimelineContext = React.createContext<TimelineContextValue | null>(null)

function useTimeline() {
  const context = React.useContext(TimelineContext)
  if (!context) throw new Error("useTimeline must be used within <Timeline>")
  return context
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, "0")}`
}

function Timeline({
  className,
  durationMs,
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  step = 1000,
  readOnly = false,
  onKeyDown,
  onPointerDown,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "defaultValue" | "onChange"> & {
  durationMs: number
  value?: number
  defaultValue?: number
  onValueChange?: (ms: number) => void
  step?: number
  readOnly?: boolean
}) {
  const t = useMessages(ui).timeline
  const [valueState, setValueState] = React.useState(defaultValue)
  const value = valueProp ?? valueState
  const ref = React.useRef<HTMLDivElement>(null)

  const clamp = (ms: number) =>
    Math.round(Math.min(durationMs, Math.max(0, ms)))
  const commit = (ms: number) => {
    const next = clamp(ms)
    if (valueProp === undefined) setValueState(next)
    onValueChange?.(next)
  }
  const fromPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return value
    return ((clientX - rect.left) / rect.width) * durationMs
  }

  const context = React.useMemo<TimelineContextValue>(
    () => ({
      durationMs,
      value,
      toPercent: (ms) =>
        durationMs > 0
          ? Math.min(100, Math.max(0, (ms / durationMs) * 100))
          : 0,
    }),
    [durationMs, value]
  )

  const interactive = !readOnly
  return (
    <TimelineContext.Provider value={context}>
      <div
        ref={ref}
        data-slot="timeline"
        data-readonly={readOnly || undefined}
        role={interactive ? "slider" : "img"}
        tabIndex={interactive ? 0 : undefined}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? durationMs : undefined}
        aria-valuenow={interactive ? value : undefined}
        aria-valuetext={
          interactive
            ? t.position(formatTime(value), formatTime(durationMs))
            : undefined
        }
        className={cn(
          "group/timeline relative h-12 w-full touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
          interactive && "cursor-pointer",
          className
        )}
        onPointerDown={(event) => {
          onPointerDown?.(event)
          if (!interactive || event.defaultPrevented || event.button !== 0)
            return
          event.currentTarget.setPointerCapture?.(event.pointerId)
          commit(fromPointer(event.clientX))
        }}
        onPointerMove={(event) => {
          if (!interactive) return
          if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
          commit(fromPointer(event.clientX))
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (!interactive || event.defaultPrevented) return
          const big = step * 10
          const moves: Record<string, number> = {
            ArrowLeft: value - (event.shiftKey ? big : step),
            ArrowDown: value - (event.shiftKey ? big : step),
            ArrowRight: value + (event.shiftKey ? big : step),
            ArrowUp: value + (event.shiftKey ? big : step),
            PageDown: value - big,
            PageUp: value + big,
            Home: 0,
            End: durationMs,
          }
          const next = moves[event.key]
          if (next === undefined) return
          event.preventDefault()
          commit(next)
        }}
        {...props}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  )
}

function TimelineLoudness({
  className,
  values,
  ...props
}: Omit<React.ComponentProps<"svg">, "values"> & {
  values: readonly number[]
}) {
  const path = React.useMemo(() => {
    if (values.length === 0) return ""
    const points = values.map(
      (v, i) => `${i},${(1 - Math.min(1, Math.max(0, v))).toFixed(3)}`
    )
    return `M0,1 L${points.join(" L")} L${values.length},1 Z`
  }, [values])
  return (
    <svg
      data-slot="timeline-loudness"
      aria-hidden
      viewBox={`0 0 ${Math.max(values.length, 1)} 1`}
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute inset-0 size-full fill-foreground/25",
        className
      )}
      {...props}
    >
      <path d={path} />
    </svg>
  )
}

const timelineRangeVariants = cva(
  "pointer-events-none absolute inset-y-0 flex items-start overflow-hidden text-[10px] leading-none font-medium",
  {
    variants: {
      variant: {
        silence:
          "bg-[repeating-linear-gradient(135deg,var(--color-foreground)_0_1px,transparent_1px_6px)] opacity-20",
        clip: "border-x-2 border-primary bg-primary/15 p-0.5 text-highlight-ink",
        selected:
          "border-x-2 border-primary bg-primary/30 p-0.5 text-primary-foreground",
        audience: "bottom-auto h-1.5 bg-chart-3",
      },
    },
    defaultVariants: { variant: "clip" },
  }
)

function TimelineRange({
  className,
  startMs,
  endMs,
  variant = "clip",
  style,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof timelineRangeVariants> & {
    startMs: number
    endMs: number
  }) {
  const { toPercent } = useTimeline()
  const left = toPercent(startMs)
  return (
    <div
      data-slot="timeline-range"
      data-variant={variant}
      className={cn(timelineRangeVariants({ variant }), className)}
      style={{
        left: `${left}%`,
        width: `${Math.max(0, toPercent(endMs) - left)}%`,
        ...style,
      }}
      {...props}
    />
  )
}

function TimelinePlayhead({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  const { value, toPercent } = useTimeline()
  return (
    <div
      data-slot="timeline-playhead"
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground",
        className
      )}
      style={{ left: `${toPercent(value)}%`, ...style }}
      {...props}
    />
  )
}

export {
  Timeline,
  TimelineLoudness,
  TimelinePlayhead,
  TimelineRange,
  timelineRangeVariants,
  useTimeline,
}
