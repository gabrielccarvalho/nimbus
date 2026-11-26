"use client"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function IconAction({
  label,
  shortcut,
  side = "top",
  variant = "ghost",
  size = "icon",
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label"> & {
  label: string
  shortcut?: string
  side?: React.ComponentProps<typeof TooltipContent>["side"]
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
