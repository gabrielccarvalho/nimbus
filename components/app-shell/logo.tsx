import { cn } from "@/lib/utils"

const CLOUD = [
  [10, 1],
  [13, 1],
  [4, 4],
  [7, 4],
  [10, 4],
  [13, 4],
  [16, 4],
  [1, 7],
  [4, 7],
  [7, 7],
  [10, 7],
  [13, 7],
  [16, 7],
  [19, 7],
  [1, 10],
  [4, 10],
  [7, 10],
  [10, 10],
  [13, 10],
  [16, 10],
  [19, 10],
] as const

export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 22 14"
      aria-hidden
      className={cn("h-3.5 w-[22px] shrink-0", className)}
      {...props}
    >
      {CLOUD.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="2.4"
          height="2.4"
          rx=".6"
          className={x === 13 && y === 4 ? "fill-amber" : "fill-current"}
        />
      ))}
    </svg>
  )
}

export function Logo({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-foreground",
        className
      )}
      {...props}
    >
      <LogoMark />
      <span data-slot="wordmark">nimbus</span>
    </span>
  )
}
