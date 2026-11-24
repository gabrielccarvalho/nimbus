import * as React from "react"
import { cn } from "cn"

import { toneVariants, type Tone } from "@/components/ui/tone"

const DOTS = 10

function DotMeter({
  className,
  value,
  max = DOTS,
  tone = "mint",
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  value: number
  max?: number
  tone?: Tone
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const lit = Math.round(ratio * DOTS)

  return (
    <span
      data-slot="dot-meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        toneVariants({ tone }),
        "inline-flex items-center gap-1",
        className
      )}
      {...props}
    >
      {Array.from({ length: DOTS }, (_, index) => (
        <i
          key={index}
          data-on={index < lit || undefined}
          className="size-1.5 rounded-full bg-white/12 data-on:bg-[rgb(var(--tone))] data-on:shadow-[0_0_6px_rgb(var(--tone)/0.5)]"
        />
      ))}
    </span>
  )
}

export { DotMeter }
