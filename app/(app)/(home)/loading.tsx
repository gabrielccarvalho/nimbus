import { Page } from "@/components/app-shell/page"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <Page aria-busy>
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </Page>
  )
}
