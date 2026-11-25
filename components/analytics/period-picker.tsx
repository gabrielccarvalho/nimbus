import Link from "next/link"

import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
} from "@/features/analytics/schema"
import { cn } from "@/lib/utils"

export function PeriodPicker({ value }: { value: AnalyticsPeriod }) {
  return (
    <nav aria-label="Period" className="flex gap-0.5">
      {ANALYTICS_PERIODS.map((period) => (
        <Link
          key={period}
          href={`/analytics?period=${period}`}
          aria-current={period === value ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground",
            period === value && "bg-glass-3 text-foreground hover:bg-glass-3"
          )}
        >
          {period} days
        </Link>
      ))}
    </nav>
  )
}
