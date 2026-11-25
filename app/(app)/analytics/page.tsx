import type { Metadata } from "next"
import { Suspense } from "react"

import { Overview } from "@/components/analytics/overview"
import { Skeleton } from "@/components/ui/skeleton"
import { getAnalyticsOverview } from "@/features/analytics/queries"
import { parsePeriod } from "@/features/analytics/schema"

export const metadata: Metadata = { title: "Analytics" }

async function OverviewSection({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>
}) {
  const { period: raw } = await searchParams
  const period = parsePeriod(Array.isArray(raw) ? raw[0] : raw)
  return <Overview {...await getAnalyticsOverview(period)} period={period} />
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-7">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[18px]" />
    </div>
  )
}

export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>
}) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewSection searchParams={searchParams} />
    </Suspense>
  )
}
