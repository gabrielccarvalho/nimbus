"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import type { Result } from "@/lib/errors"
import { PLAYBOOK_CAP_MESSAGE } from "@/features/insights/schema"

export function isCapError(result: Result<unknown>) {
  return (
    !result.ok &&
    result.error.code === "CONFLICT" &&
    result.error.message === PLAYBOOK_CAP_MESSAGE
  )
}

export function useInsightAction() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const run = (
    action: () => Promise<Result<unknown>>,
    { onCap, onDone }: { onCap?: () => void; onDone?: () => void } = {}
  ) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        if (onCap && isCapError(result)) onCap()
        else toast.error(result.error.message)
        return
      }
      onDone?.()
      router.refresh()
    })
  return { pending, run }
}
