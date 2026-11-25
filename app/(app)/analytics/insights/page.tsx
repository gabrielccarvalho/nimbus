import type { Metadata } from "next"
import { Suspense } from "react"

import { Insights } from "@/components/analytics/insights"
import { Skeleton } from "@/components/ui/skeleton"
import { getInsights } from "@/features/insights/queries"

export const metadata: Metadata = { title: "Insights · Analytics" }

async function InsightsSection() {
  return <Insights {...await getInsights()} />
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 rounded-[18px]" />}>
      <InsightsSection />
    </Suspense>
  )
}
