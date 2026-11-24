import { Page } from "@/components/app-shell/page"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <Page aria-busy>
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-72 rounded-[18px]" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-video rounded-[14px]" />
        ))}
      </div>
    </Page>
  )
}
