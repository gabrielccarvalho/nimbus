"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

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
import type { ShortRow } from "@/features/analytics/queries"

const DAYS = 28

const config = {
  median: { label: "Channel median", color: "var(--chart-1)" },
  highlighted: { label: "Highlighted Short", color: "var(--chart-3)" },
  others: { label: "Shorts", color: "var(--chart-4)" },
} satisfies ChartConfig

const number = new Intl.NumberFormat("en-US")

function summarize(count: number, median: (number | null)[]) {
  const lead = `Growth since upload for ${count} ${count === 1 ? "Short" : "Shorts"}.`
  const last = median.findLastIndex((value) => value !== null)
  return last < 0
    ? lead
    : `${lead} The channel median reaches ${number.format(median[last]!)} views by day ${last}.`
}

export function GrowthChart({
  rows,
  median,
  highlightedId,
}: {
  rows: ShortRow[]
  median: (number | null)[]
  highlightedId: string | null
}) {
  const highlighted = rows.find((row) => row.publicationId === highlightedId)
  const data = Array.from({ length: DAYS + 1 }, (_, day) => ({
    day,
    median: median[day] ?? null,
    ...Object.fromEntries(
      rows.map((row, i) => [`s${i}`, row.curve[day] ?? null])
    ),
  }))
  const highlightedIndex = rows.findIndex(
    (row) => row.publicationId === highlightedId
  )

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {summarize(rows.length, median)}
      </p>
      <p aria-live="polite" className="min-h-5 text-sm">
        {highlighted ? `Highlighted: ${highlighted.title}` : ""}
      </p>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <LineChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, DAYS]}
            ticks={[0, 7, 14, 21, 28]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(day: number) => `Day ${day}`}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  `Day ${payload?.[0]?.payload?.day ?? ""}`
                }
              />
            }
          />
          {rows.map((row, i) =>
            i === highlightedIndex ? null : (
              <Line
                key={row.publicationId}
                dataKey={`s${i}`}
                name={row.title}
                stroke="var(--color-others)"
                strokeOpacity={highlighted ? 0.18 : 0.3}
                strokeWidth={1}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )
          )}
          <Line
            dataKey="median"
            name="Channel median"
            stroke="var(--color-median)"
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />
          {highlighted && (
            <Line
              dataKey={`s${highlightedIndex}`}
              name={highlighted.title}
              stroke="var(--color-highlighted)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ChartContainer>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          Show as table
        </summary>
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-end">Channel median</TableHead>
              {rows.map((row) => (
                <TableHead key={row.publicationId} className="text-end">
                  {row.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.day}>
                <TableCell>{point.day}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {point.median === null ? "—" : number.format(point.median)}
                </TableCell>
                {rows.map((row, i) => {
                  const value = point[`s${i}` as keyof typeof point] as
                    number | null
                  return (
                    <TableCell
                      key={row.publicationId}
                      className="text-end tabular-nums"
                    >
                      {value === null ? "—" : number.format(value)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  )
}
