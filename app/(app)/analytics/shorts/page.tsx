import type { Metadata } from "next"
import { Suspense } from "react"

import { ShortsPanel } from "@/components/analytics/shorts-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { getShorts } from "@/features/analytics/queries"

export const metadata: Metadata = { title: "Shorts · Analytics" }

async function Shorts() {
  return <ShortsPanel {...await getShorts()} />
}

export default function ShortsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-[18px]" />}>
      <Shorts />
    </Suspense>
  )
}
