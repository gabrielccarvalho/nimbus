import * as React from "react"
import { cn } from "cn"

const WIDTH = 100
const HEIGHT = 32

function Sparkline({
  className,
  values,
  markers = [],
  label,
  ...props
}: Omit<React.ComponentProps<"svg">, "children" | "values"> & {
  values: number[]
  markers?: number[]
  label: string
}) {
  const peak = Math.max(1, ...values)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH
      const y = HEIGHT - (Math.max(value, 0) / peak) * HEIGHT
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg
      data-slot="sparkline"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-10 w-full text-primary", className)}
      {...props}
    >
      {markers.map((marker) => (
        <line
          key={marker}
          x1={marker * WIDTH}
          x2={marker * WIDTH}
          y1={0}
          y2={HEIGHT}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {values.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

export { Sparkline }
