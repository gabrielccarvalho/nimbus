"use client"

import { usePathname, useSearchParams } from "next/navigation"

import {
  AppHeader,
  AppHeaderActions,
  AppHeaderContext,
  AppHeaderDivider,
  AppHeaderHeading,
  AppHeaderTab,
  AppHeaderTabs,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "@/components/app-shell/app-header"
import { AppHeaderSlot } from "@/components/app-shell/header-slot"
import { parsePeriod } from "@/features/analytics/schema"

import { PeriodPicker } from "./period-picker"

const TABS = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/shorts", label: "Shorts" },
  { href: "/analytics/insights", label: "Insights" },
] as const

export function AnalyticsHeader({
  channelTitle,
}: {
  channelTitle: string | null
}) {
  const pathname = usePathname()
  const period = parsePeriod(useSearchParams().get("period") ?? undefined)
  const overview = pathname === "/analytics"
  return (
    <AppHeader>
      <AppHeaderHeading>
        <AppHeaderContext>
          {channelTitle
            ? `YouTube · ${channelTitle}`
            : "How your Shorts and your channel are doing"}
        </AppHeaderContext>
        <AppHeaderTitleRow>
          <AppHeaderTitle>Analytics</AppHeaderTitle>
          <AppHeaderSlot className="flex min-w-0 items-center gap-1.5" />
        </AppHeaderTitleRow>
      </AppHeaderHeading>
      {channelTitle && (
        <>
          <AppHeaderTabs aria-label="Analytics sections">
            {TABS.map((tab) => (
              <AppHeaderTab
                key={tab.href}
                href={tab.href}
                active={
                  tab.href === "/analytics"
                    ? overview
                    : pathname.startsWith(tab.href)
                }
              >
                {tab.label}
              </AppHeaderTab>
            ))}
          </AppHeaderTabs>
          {overview && (
            <>
              <AppHeaderDivider />
              <AppHeaderActions>
                <PeriodPicker value={period} />
              </AppHeaderActions>
            </>
          )}
        </>
      )}
    </AppHeader>
  )
}
