"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:focus-ring aria-invalid:inset-ring-1 aria-invalid:inset-ring-pink data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-[18px] data-[size=sm]:w-[30px] data-checked:bg-mint data-unchecked:bg-white/16 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full transition-[transform,background-color] duration-[250ms,200ms] ease-snappy group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3 data-checked:bg-night group-data-[size=default]/switch:data-checked:translate-x-4 group-data-[size=sm]/switch:data-checked:translate-x-3 rtl:group-data-[size=default]/switch:data-checked:-translate-x-4 rtl:group-data-[size=sm]/switch:data-checked:-translate-x-3 data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
