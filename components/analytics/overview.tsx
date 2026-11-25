import Link from "next/link"

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

import { PeriodPicker } from "./period-picker"
import { ViewsChart } from "./views-chart"

const number = new Intl.NumberFormat("en-US")
const hours = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
})

function formatDay(day: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

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
  const tiles =
    summary &&
    ([
      {
        key: "views",
        label: "Views",
        value: number.format(summary.current.views),
      },
      {
        key: "watchHours",
        label: "Watch hours",
        value: hours.format(summary.current.watchHours),
      },
      {
        key: "netSubscribers",
        label: "Net subscribers",
        value: number.format(summary.current.netSubscribers),
      },
      {
        key: "averageViewDurationS",
        label: "Average view duration",
        value: formatSeconds(summary.current.averageViewDurationS),
      },
      {
        key: "likes",
        label: "Likes",
        value: number.format(summary.current.likes),
      },
    ] as const)

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PeriodPicker value={period} />
        {dataThrough && (
          <p className="text-[13px] text-tertiary">
            Data through {formatDay(dataThrough)}. YouTube shares numbers 2–3
            days late.
          </p>
        )}
      </div>

      {!summary || !tiles ? (
        <Empty className="rounded-[18px] bg-graphite">
          <EmptyHeader>
            <EmptyDescription>
              {syncing
                ? "Fetching your channel's numbers from YouTube…"
                : "No views in this period yet."}
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
                  <StatCardLabel>{tile.label}</StatCardLabel>
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
              Views per day
            </h2>
            <ViewsChart series={series} split={split} period={period} />
          </section>

          <section aria-labelledby="top-shorts-heading" className="grid gap-3">
            <h2 id="top-shorts-heading" className="font-medium">
              Top Shorts this period
            </h2>
            {topShorts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Short gained views in this period.
              </p>
            ) : (
              <ol className="grid gap-1.5">
                {topShorts.map((short) => {
                  const href =
                    short.projectId && short.clipId
                      ? (`/projects/${short.projectId}/clips/${short.clipId}` as const)
                      : short.url
                  const title = short.title || "Untitled Short"
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
                        +{number.format(short.views)} views
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
