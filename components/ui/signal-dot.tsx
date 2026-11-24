import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { toneVariants, type Tone } from "@/components/ui/tone"

const signalDotVariants = cva(
  "inline-block shrink-0 rounded-[2px] bg-[rgb(var(--tone))]",
  {
    variants: {
      size: {
        default: "size-2",
        sm: "size-1.5",
      },
      lit: {
        true: "shadow-[0_0_10px_rgb(var(--tone)/0.7)]",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      lit: false,
    },
  }
)

function SignalDot({
  className,
  tone = "mint",
  size = "default",
  lit = false,
  label,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof signalDotVariants> & {
    tone?: Tone
    label?: string
  }) {
  return (
    <span
      data-slot="signal-dot"
      data-tone={tone}
      data-lit={lit || undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        toneVariants({ tone }),
        signalDotVariants({ size, lit }),
        className
      )}
      {...props}
    />
  )
}

export { SignalDot, signalDotVariants }
