import { cn } from "cn"
import * as React from "react"

const MIN_HEIGHT = 1.5

function wavePath(values: readonly number[], gain: number) {
  const half = values.map(
    (value) => Math.min(100, Math.max(MIN_HEIGHT, value * gain * 100)) / 2
  )
  const top = half.map((h, i) => `L${i + 0.5} ${50 - h}`)
  const bottom = half.map((h, i) => `L${i + 0.5} ${50 + h}`).reverse()
  const end = values.length
  return `M0 ${50 - half[0]!}${top.join("")}L${end} ${50 - half.at(-1)!}L${end} ${50 + half.at(-1)!}${bottom.join("")}L0 ${50 + half[0]!}Z`
}

function Waveform({
  className,
  values,
  gain = 1,
  ...props
}: Omit<React.ComponentProps<"svg">, "values"> & {
  values: readonly number[]
  gain?: number
}) {
  return (
    <svg
      data-slot="waveform"
      aria-hidden
      viewBox={`0 0 ${Math.max(1, values.length)} 100`}
      preserveAspectRatio="none"
      className={cn("pointer-events-none fill-current", className)}
      {...props}
    >
      {values.length > 0 && <path d={wavePath(values, gain)} />}
    </svg>
  )
}

export { Waveform }
