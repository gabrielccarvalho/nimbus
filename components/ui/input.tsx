import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl bg-graphite-2 px-3.5 text-[15px] tracking-[-0.011em] inset-ring-1 inset-ring-hair transition-shadow duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-tertiary focus-visible:ring-3 focus-visible:ring-lav/16 focus-visible:inset-ring-lav disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-pink/16 aria-invalid:inset-ring-pink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
