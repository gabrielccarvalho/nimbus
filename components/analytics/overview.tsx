"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { ChartBarIcon } from "@phosphor-icons/react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { SignalDot } from "@/components/ui/signal-dot"
import {
  StatCard,
  StatCardDescription,
  StatCardGroup,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card"
import type { getAnalyticsOverview } from "@/features/analytics/queries"
import type { AnalyticsPeriod } from "@/features/analytics/schema"

import { ViewsChart } from "./views-chart"

const POLL_MS = 5000

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
  const router = useRouter()

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

  const top = (
    <aside
      aria-labelledby="top-shorts-heading"
      className="flex min-w-0 flex-[1_0_340px] flex-col lg:max-w-[340px] lg:shadow-[inset_1px_0_0_var(--hair)]"
    >
      <h2 id="top-shorts-heading" className="px-4 pt-[18px] pb-2.5 mono-label">
        Top Shorts this period
      </h2>
      {topShorts.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">
          No Short gained views in this period.
        </p>
      ) : (
        <ol className="grid gap-0.5 px-2 pb-4">
          {topShorts.map((short, index) => {
            const href =
              short.projectId && short.clipId
                ? (`/projects/${short.projectId}/clips/${short.clipId}` as const)
                : short.url
            const title = short.title || "Untitled Short"
            const share = Math.round(
              (short.views / Math.max(1, topShorts[0]?.views ?? 1)) * 100
            )
            return (
              <li
                key={short.publicationId}
                className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-2.5"
              >
                <span className="font-mono text-xs text-tertiary tabular-nums">
                  {index + 1}
                </span>
                <span className="grid min-w-0 gap-1.5">
                  {href === null ? (
                    <span className="truncate font-medium">{title}</span>
                  ) : href.startsWith("/") ? (
                    <Link
                      href={href as "/"}
                      className="truncate font-medium hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium hover:underline"
                    >
                      {title}
                    </a>
                  )}
                  <span
                    aria-hidden
                    className="h-1 overflow-hidden rounded-full bg-white/8"
                  >
                    <i
                      className="block h-full rounded-full bg-lav"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground tabular-nums">
                  +{number.format(short.views)} views
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-auto px-4 py-3 text-[12.5px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]">
        Views gained in the last {period} days, not lifetime views.
      </p>
    </aside>
  )

  return (
    <div className="flex min-w-0 flex-1 flex-wrap">
      <div className="grid min-w-0 flex-[999_1_520px] content-start gap-[18px] p-[18px]">
        {dataThrough && (
          <p className="text-[13px] text-tertiary">
            Data through {formatDay(dataThrough)}. YouTube shares numbers 2–3
            days late.
          </p>
        )}
        {!summary || !tiles ? (
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartBarIcon />
              </EmptyMedia>
              <EmptyTitle>
                {syncing ? "Getting your numbers" : "Nothing to show yet"}
              </EmptyTitle>
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
                    <StatCardDescription className="flex flex-wrap items-center gap-x-1.5">
                      {change === null ? (
                        <span>—</span>
                      ) : (
                        <>
                          <SignalDot
                            tone={
                              change > 0
                                ? "mint"
                                : change < 0
                                  ? "amber"
                                  : "neutral"
                            }
                          />
                          <b className="font-semibold text-foreground">
                            {percent.format(change)}
                          </b>
                        </>
                      )}
                      <span>vs previous {period} days</span>
                    </StatCardDescription>
                  </StatCard>
                )
              })}
            </StatCardGroup>
            <section
              aria-labelledby="views-heading"
              className="grid gap-3 rounded-[18px] bg-graphite p-5"
            >
              <h2
                id="views-heading"
                className="text-base font-semibold tracking-[-0.02em]"
              >
                Views per day
              </h2>
              <ViewsChart series={series} split={split} period={period} />
            </section>
          </>
        )}
      </div>
      {summary && tiles && top}
    </div>
  )
}
