"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { importShortsAction } from "@/features/analytics/actions"
import type { ImportState } from "@/features/analytics/queries"

import { useInsightAction } from "./use-insight-action"

const POLL_MS = 5000

export function ImportShorts({
  importing,
  uploadsSyncedAt,
}: {
  importing: ImportState
  uploadsSyncedAt: Date | null
}) {
  const router = useRouter()
  const { pending, run } = useInsightAction()
  const busy = importing.state !== "idle"

  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [busy, router])

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        size="sm"
        disabled={busy || pending}
        onClick={() => run(importShortsAction)}
      >
        {importing.state === "running"
          ? `Importing… ${Math.round(importing.progress)}%`
          : "Import past Shorts"}
      </Button>
      {importing.state === "waiting_quota" && (
        <span className="text-[13px] text-muted-foreground">
          Import continues after YouTube&apos;s daily quota resets.
        </span>
      )}
      {importing.state === "idle" && importing.error && (
        <span role="alert" className="text-[13px] text-amber">
          {importing.error}
        </span>
      )}
      {uploadsSyncedAt && (
        <span className="text-[13px] text-muted-foreground">
          New uploads are imported daily.
        </span>
      )}
    </div>
  )
}
