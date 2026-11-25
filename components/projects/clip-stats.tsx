"use client"

import { ArrowsClockwiseIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Sparkline } from "@/components/ui/sparkline"
import { refreshStatsAction } from "@/features/publishing/actions"

import type { PublicationState } from "./publish-dialog"

const counts = new Intl.NumberFormat("en")

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
  const { stats, early, refreshing, status } = publication
  const { pending, refresh } = useRefreshStats(publication.id)
  const removed = status === "removed"
  const busy = refreshing || pending

  return (
    <section aria-label="YouTube stats" className="flex flex-col gap-2 text-sm">
      {removed && (
        <p className="text-xs text-muted-foreground">Removed from YouTube</p>
      )}
      {stats ? (
        <>
          <p className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>{counts.format(stats.views)} views</span>
            <span>{counts.format(stats.likes)} likes</span>
            <span>{counts.format(stats.comments)} comments</span>
          </p>
          {(stats.averageViewDurationS !== null ||
            stats.averageViewPercentage !== null) && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              {stats.averageViewDurationS !== null && (
                <span>
                  {stats.averageViewDurationS.toFixed(1)} s average view
                </span>
              )}
              {stats.averageViewPercentage !== null && (
                <span>
                  {Math.round(stats.averageViewPercentage)}% watched on average
                </span>
              )}
            </p>
          )}
          {stats.retention.length > 0 ? (
            <Sparkline
              values={stats.retention}
              markers={stats.markers}
              label="Retention: share of viewers still watching across the clip"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              YouTube hasn&apos;t shared the retention curve yet
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No stats yet</p>
      )}
      {early && !removed && (
        <p className="text-xs text-muted-foreground">Data still coming in</p>
      )}
      {!removed && (
        <div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>
            <ArrowsClockwiseIcon data-icon="inline-start" aria-hidden />
            {busy ? "Refreshing…" : "Refresh stats"}
          </Button>
        </div>
      )}
    </section>
  )
}
