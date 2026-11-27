"use client"

import { ArrowsClockwiseIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Sparkline } from "@/components/ui/sparkline"
import { refreshStatsAction } from "@/features/publishing/actions"
import { useMessages } from "@/lib/i18n/client"

import { review } from "./messages/review"
import type { PublicationState } from "./publish-dialog"

const POLL_MS = 5000

function useRefreshStats(publicationId: string) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const refresh = () =>
    startTransition(async () => {
      const result = await refreshStatsAction(publicationId)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.refresh()
    })
  return { pending, refresh }
}

export function ClipStats({ publication }: { publication: PublicationState }) {
  const t = useMessages(review).stats
  const { stats, early, refreshing, status } = publication
  const { pending, refresh } = useRefreshStats(publication.id)
  const removed = status === "removed"
  const busy = refreshing || pending
  const router = useRouter()

  React.useEffect(() => {
    if (!refreshing) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refreshing, router])

  return (
    <section aria-label={t.label} className="flex flex-col gap-2 text-sm">
      {removed && <p className="text-xs text-muted-foreground">{t.removed}</p>}
      {stats ? (
        <>
          <p className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>{t.views(stats.views)}</span>
            <span>{t.likes(stats.likes)}</span>
            <span>{t.comments(stats.comments)}</span>
          </p>
          {(stats.averageViewDurationS !== null ||
            stats.averageViewPercentage !== null) && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              {stats.averageViewDurationS !== null && (
                <span>{t.averageView(stats.averageViewDurationS)}</span>
              )}
              {stats.averageViewPercentage !== null && (
                <span>
                  {t.averageWatched(Math.round(stats.averageViewPercentage))}
                </span>
              )}
            </p>
          )}
          {stats.retention.length > 0 ? (
            <Sparkline
              values={stats.retention}
              markers={stats.markers}
              label={t.retention}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t.noRetention}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t.empty}</p>
      )}
      {early && !removed && (
        <p className="text-xs text-muted-foreground">{t.early}</p>
      )}
      {!removed && (
        <div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>
            <ArrowsClockwiseIcon data-icon="inline-start" aria-hidden />
            {busy ? t.refreshing : t.refresh}
          </Button>
        </div>
      )}
    </section>
  )
}
