"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DailyPoint } from "@/features/analytics/curves"
import type { AnalyticsPeriod } from "@/features/analytics/schema"
import { useLocale, useMessages } from "@/lib/i18n/client"

import { analytics } from "./messages"

export function ViewsChart({
  series,
  split,
  period,
}: {
  series: DailyPoint[]
  split: boolean
  period: AnalyticsPeriod
}) {
  const locale = useLocale()
  const t = useMessages(analytics).viewsChart
  const { number, compact, dayFormat } = useMemo(
    () => ({
      number: new Intl.NumberFormat(locale),
      compact: new Intl.NumberFormat(locale, { notation: "compact" }),
      dayFormat: new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    }),
    [locale]
  )
  const shortDay = (day: string) =>
    dayFormat.format(new Date(`${day}T00:00:00Z`))
  const config = {
    views: { label: t.views, color: "var(--chart-1)" },
    shorts: { label: t.shorts, color: "var(--chart-1)" },
    longForm: { label: t.longForm, color: "var(--chart-2)" },
  } satisfies ChartConfig
  const data = series.map((point) => ({
    day: point.day,
    views: point.shorts + point.long + point.other,
    shorts: point.shorts,
    longForm: point.long + point.other,
  }))
  const total = data.reduce((sum, point) => sum + point.views, 0)
  const shorts = data.reduce((sum, point) => sum + point.shorts, 0)
  const summary = split
    ? t.splitSummary(total, period, shorts, total - shorts)
    : t.summary(total, period)

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{summary}</p>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={shortDay}
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(value: number) => compact.format(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => shortDay(String(label))}
              />
            }
          />
          {split ? (
            <>
              <Bar
                dataKey="shorts"
                stackId="views"
                fill="var(--color-shorts)"
              />
              <Bar
                dataKey="longForm"
                stackId="views"
                fill="var(--color-longForm)"
              />
            </>
          ) : (
            <Bar dataKey="views" fill="var(--color-views)" />
          )}
        </BarChart>
      </ChartContainer>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          {t.showTable}
        </summary>
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead>{t.day}</TableHead>
              {split ? (
                <>
                  <TableHead className="text-end">{t.shorts}</TableHead>
                  <TableHead className="text-end">{t.longForm}</TableHead>
                </>
              ) : (
                <TableHead className="text-end">{t.views}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.day}>
                <TableCell>{shortDay(point.day)}</TableCell>
                {split ? (
                  <>
                    <TableCell className="text-end tabular-nums">
                      {number.format(point.shorts)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {number.format(point.longForm)}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-end tabular-nums">
                    {number.format(point.views)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  )
}
