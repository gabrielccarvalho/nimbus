import type { Metadata } from "next"
import { Suspense } from "react"

import { analytics } from "@/components/analytics/messages"
import { Insights } from "@/components/analytics/insights"
import { Skeleton } from "@/components/ui/skeleton"
import { getMessages } from "@/lib/i18n/server"
import { getInsights } from "@/features/insights/queries"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(analytics)).layout.insightsTitle }
}

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
