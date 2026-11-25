"use client"

import { VideoIcon } from "@phosphor-icons/react"
import { useState } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import type { getShorts } from "@/features/analytics/queries"

import { GrowthChart } from "./growth-chart"
import { ImportShorts } from "./import-shorts"
import { ShortsTable } from "./shorts-table"

export function ShortsPanel({
  rows,
  median,
  importing,
  uploadsSyncedAt,
}: Awaited<ReturnType<typeof getShorts>>) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const importShorts = (
    <ImportShorts importing={importing} uploadsSyncedAt={uploadsSyncedAt} />
  )

  if (rows.length === 0) {
    return (
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <VideoIcon />
          </EmptyMedia>
          <EmptyDescription>
            No Shorts yet. Publish a clip, or import the Shorts you posted
            before Nimbus.
          </EmptyDescription>
        </EmptyHeader>
        {importShorts}
      </Empty>
    )
  }

  return (
    <div className="grid gap-6">
      {importShorts}
      <GrowthChart rows={rows} median={median} highlightedId={highlightedId} />
      <ShortsTable
        rows={rows}
        highlightedId={highlightedId}
        onHighlight={setHighlightedId}
      />
    </div>
  )
}
