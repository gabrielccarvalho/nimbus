"use client"

import { cn } from "cn"
import { SpinnerIcon } from "@phosphor-icons/react"

import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useMessages(common)
  return (
    <SpinnerIcon
      data-slot="spinner"
      role="status"
      aria-label={t.loading}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
