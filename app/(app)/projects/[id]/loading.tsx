import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row" aria-busy>
      <div className="grid flex-1 content-start gap-[18px] p-[18px]">
        <Skeleton className="h-20 rounded-[18px]" />
        <Skeleton className="aspect-video max-w-[720px] rounded-[18px]" />
      </div>
      <div className="grid w-full content-start gap-3 p-4 lg:w-[340px]">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
