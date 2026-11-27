"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { importShortsAction } from "@/features/analytics/actions"
import type { ImportState } from "@/features/analytics/queries"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"

import { analytics } from "./messages"
import { useInsightAction } from "./use-insight-action"

const POLL_MS = 5000

export function ImportShorts({
  importing,
  uploadsSyncedAt,
}: {
  importing: ImportState
  uploadsSyncedAt: Date | null
}) {
  const locale = useLocale()
  const router = useRouter()
  const t = useMessages(analytics).shorts
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
          ? t.importing(Math.round(importing.progress))
          : t.importPast}
      </Button>
      {importing.state === "waiting_quota" && (
        <span className="text-[13px] text-muted-foreground">
          {t.waitingQuota}
        </span>
      )}
      {importing.state === "idle" && importing.error && (
        <span role="alert" className="text-[13px] text-amber">
          {translateError(importing.error, locale)}
        </span>
      )}
      {uploadsSyncedAt && (
        <span className="text-[13px] text-muted-foreground">
          {t.importedDaily}
        </span>
      )}
    </div>
  )
}
