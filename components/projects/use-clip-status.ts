"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import { useMessages } from "@/lib/i18n/client"

import { review } from "./messages/review"

export function useClipStatus(projectId: string, clip: Clip) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const t = useMessages(review).status

  const setStatus = (status: Clip["status"]) =>
    startTransition(async () => {
      const result = await setClipStatusAction(projectId, clip.id, status)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      if (status === "rejected") {
        toast(t.rejected(clip.title), {
          action: {
            label: t.undo,
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
