"use client"

import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
} from "@/features/analytics/schema"

/** A filter, so a glass button with a caret: never a row that reads as tabs. */
export function PeriodPicker({ value }: { value: AnalyticsPeriod }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" aria-label={`Period: last ${value} days`} />
        }
      >
        <CalendarBlankIcon data-icon="inline-start" aria-hidden />
        Last {value} days
        <CaretDownIcon data-icon="inline-end" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {ANALYTICS_PERIODS.map((period) => (
          <DropdownMenuItem
            key={period}
            render={
              <Link
                href={`/analytics?period=${period}`}
                aria-current={period === value ? "page" : undefined}
              />
            }
          >
            {period} days
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
