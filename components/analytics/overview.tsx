"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"

import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import {
  StatCard,
  StatCardDescription,
  StatCardGroup,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card"
import type { getAnalyticsOverview } from "@/features/analytics/queries"
import type { AnalyticsPeriod } from "@/features/analytics/schema"
import { useLocale, useMessages } from "@/lib/i18n/client"

import { analytics } from "./messages"
import { PeriodPicker } from "./period-picker"
import { ViewsChart } from "./views-chart"

const POLL_MS = 5000

function formatSeconds(seconds: number | null) {
  if (seconds === null) return "—"
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export function Overview({
  dataThrough,
  split,
  summary,
  series,
  topShorts,
  syncing,
  period,
}: Awaited<ReturnType<typeof getAnalyticsOverview>> & {
  period: AnalyticsPeriod
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useMessages(analytics).overview
  const { number, hours, percent, day } = useMemo(
    () => ({
      number: new Intl.NumberFormat(locale),
      hours: new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      percent: new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
      }),
      day: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    }),
    [locale]
  )

  useEffect(() => {
    if (!syncing) return
    const id = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [syncing, router])

  const tiles =
    summary &&
    ([
      {
        key: "views",
        value: number.format(summary.current.views),
      },
      {
        key: "watchHours",
        value: hours.format(summary.current.watchHours),
      },
      {
        key: "netSubscribers",
        value: number.format(summary.current.netSubscribers),
      },
      {
        key: "averageViewDurationS",
        value: formatSeconds(summary.current.averageViewDurationS),
      },
      {
        key: "likes",
        value: number.format(summary.current.likes),
      },
    ] as const)

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PeriodPicker value={period} />
        {dataThrough && (
          <p className="text-[13px] text-tertiary">
            {t.dataThrough(day.format(new Date(`${dataThrough}T00:00:00Z`)))}
          </p>
        )}
      </div>

      {!summary || !tiles ? (
        <Empty className="rounded-[18px] bg-graphite">
          <EmptyHeader>
            <EmptyDescription>
              {syncing ? t.fetching : t.empty}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <StatCardGroup className="lg:grid-cols-5">
            {tiles.map((tile) => {
              const change = summary.change[tile.key]
              return (
                <StatCard key={tile.key}>
                  <StatCardLabel>{t.tiles[tile.key]}</StatCardLabel>
                  <StatCardValue>{tile.value}</StatCardValue>
                  <StatCardDescription>
                    {change === null ? "—" : percent.format(change)}
                  </StatCardDescription>
                </StatCard>
              )
            })}
          </StatCardGroup>

          <section aria-labelledby="views-heading" className="grid gap-3">
            <h2 id="views-heading" className="font-medium">
              {t.viewsPerDay}
            </h2>
            <ViewsChart series={series} split={split} period={period} />
          </section>

          <section aria-labelledby="top-shorts-heading" className="grid gap-3">
            <h2 id="top-shorts-heading" className="font-medium">
              {t.topShorts}
            </h2>
            {topShorts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noTopShorts}</p>
            ) : (
              <ol className="grid gap-1.5">
                {topShorts.map((short) => {
                  const href =
                    short.projectId && short.clipId
                      ? (`/projects/${short.projectId}/clips/${short.clipId}` as const)
                      : short.url
                  const title = short.title || t.untitled
                  return (
                    <li
                      key={short.publicationId}
                      className="flex items-center justify-between gap-4 rounded-xl bg-graphite-2 px-4 py-2.5"
                    >
                      {href === null ? (
                        <span className="min-w-0 truncate">{title}</span>
                      ) : href.startsWith("/") ? (
                        <Link
                          href={href as "/"}
                          className="min-w-0 truncate hover:underline"
                        >
                          {title}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate hover:underline"
                        >
                          {title}
                        </a>
                      )}
                      <span className="shrink-0 font-mono text-[13px] text-muted-foreground tabular-nums">
                        {t.gained(short.views)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  )
}
