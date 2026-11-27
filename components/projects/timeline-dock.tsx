import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

const SWATCHES = {
  clip: "rounded-[3px] bg-lav/45",
  selected: "rounded-[3px] inset-ring-2 inset-ring-foreground",
  selection: "rounded-[3px] bg-lav/30 inset-ring-[1.5px] inset-ring-lav",
  silence:
    "rounded-[3px] bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.3)_0_2px,transparent_2px_4px)]",
  audience: "h-1 rounded-sm bg-amber",
  playhead: "w-0.5 bg-amber",
} as const

export type DockLegendKind = keyof typeof SWATCHES

/** One entry per colour or texture drawn on the timeline (UX_PATTERNS › Time). */
export function DockLegend({
  items,
}: {
  items: readonly { kind: DockLegendKind; label: string }[]
}) {
  return (
    <ul
      data-slot="dock-legend"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground"
    >
      {items.map((item) => (
        <li key={item.kind} className="flex items-center gap-1.5">
          <i aria-hidden className={cn("size-2.5", SWATCHES[item.kind])} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** The dock at the bottom of a project page: anything laid out along time. */
export function TimelineDock({
  label,
  summary,
  legend,
  durationMs,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "aria-label"> & {
  label: string
  summary?: React.ReactNode
  legend: readonly { kind: DockLegendKind; label: string }[]
  durationMs: number
}) {
  return (
    <section
      data-slot="timeline-dock"
      aria-label={label}
      className={cn(
        "grid shrink-0 gap-2 bg-sheet px-[18px] pt-2.5 pb-3 shadow-[inset_0_1px_0_var(--hair)]",
        className
      )}
      {...props}
    >
      <div className="flex min-h-6 flex-wrap items-center gap-x-3.5 gap-y-1">
        <h2 className="mono-label">{label}</h2>
        {summary && (
          <span className="text-xs text-muted-foreground">{summary}</span>
        )}
        <span className="flex-1" />
        <DockLegend items={legend} />
      </div>
      {children}
      <div
        aria-hidden
        className="flex justify-between font-mono text-[11px] text-tertiary tabular-nums"
      >
        <span>0:00</span>
        <span>{formatDuration(durationMs / 4)}</span>
        <span>{formatDuration(durationMs / 2)}</span>
        <span>{formatDuration((durationMs * 3) / 4)}</span>
        <span>{formatDuration(durationMs)}</span>
      </div>
    </section>
  )
}
