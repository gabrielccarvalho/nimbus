import type { Metadata } from "next"
import { Suspense } from "react"

import { analytics } from "@/components/analytics/messages"
import { ShortsPanel } from "@/components/analytics/shorts-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { getMessages } from "@/lib/i18n/server"
import { getShorts } from "@/features/analytics/queries"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(analytics)).layout.shortsTitle }
}

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
