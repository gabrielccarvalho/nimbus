"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"

export function useClipStatus(projectId: string, clip: Clip) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  const setStatus = (status: Clip["status"]) =>
    startTransition(async () => {
      const result = await setClipStatusAction(projectId, clip.id, status)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      if (status === "rejected") {
        toast(`Rejected “${clip.title}”`, {
          action: {
            label: "Undo",
            onClick: () => {
              void setClipStatusAction(projectId, clip.id, clip.status).then(
                () => router.refresh()
              )
            },
          },
        })
      }
      router.refresh()
    })

  return { pending, setStatus }
}
