"use client"

import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ShortRow } from "@/features/analytics/queries"
import { useLocale, useMessages } from "@/lib/i18n/client"

import { analytics } from "./messages"

type SortKey =
  | "publishedAt"
  | "ageDays"
  | "views"
  | "averageViewPercentage"
  | "viewsDay1"
  | "viewsDay7"
  | "viewsDay28"
  | "relative"
type Direction = "asc" | "desc"

const COLUMNS: SortKey[] = [
  "publishedAt",
  "ageDays",
  "views",
  "averageViewPercentage",
  "viewsDay1",
  "viewsDay7",
  "viewsDay28",
  "relative",
]

function sortValue(row: ShortRow, key: SortKey): number | null {
  return key === "publishedAt" ? row.publishedAt.getTime() : row[key]
}

function sortRows(rows: ShortRow[], key: SortKey, dir: Direction) {
  const sign = dir === "desc" ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return (x - y) * sign
  })
}

export function ShortsTable({
  rows,
  highlightedId,
  onHighlight,
}: {
  rows: ShortRow[]
  highlightedId: string | null
  onHighlight: (id: string | null) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction }>({
    key: "publishedAt",
    dir: "desc",
  })
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])
  const locale = useLocale()
  const t = useMessages(analytics).shorts
  const { views, percent, ratio, day } = useMemo(
    () => ({
      views: new Intl.NumberFormat(locale),
      percent: new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
      ratio: new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        useGrouping: false,
      }),
      day: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    }),
    [locale]
  )
  const count = (value: number | null) =>
    value === null ? "—" : views.format(value)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.title}</TableHead>
          {COLUMNS.map((key) => {
            const active = sort.key === key
            return (
              <TableHead
                key={key}
                aria-sort={
                  active
                    ? sort.dir === "desc"
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    setSort({
                      key,
                      dir: active && sort.dir === "desc" ? "asc" : "desc",
                    })
                  }
                >
                  {t.columns[key]}
                  {active &&
                    (sort.dir === "desc" ? (
                      <ArrowDownIcon aria-hidden />
                    ) : (
                      <ArrowUpIcon aria-hidden />
                    ))}
                </button>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow
            key={row.publicationId}
            tabIndex={0}
            data-state={
              row.publicationId === highlightedId ? "selected" : undefined
            }
            onMouseEnter={() => onHighlight(row.publicationId)}
            onMouseLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(row.publicationId)}
            onBlur={() => onHighlight(null)}
          >
            <TableCell className="max-w-72">
              <div className="flex items-center gap-2">
                {row.origin === "imported" && row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium hover:underline"
                  >
                    {row.title}
                  </a>
                ) : row.clipId && row.projectId ? (
                  <Link
                    href={`/projects/${row.projectId}/clips/${row.clipId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{row.title}</span>
                )}
                {row.origin === "imported" && (
                  <Badge variant="secondary">{t.imported}</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {day.format(row.publishedAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {t.age(row.ageDays)}
            </TableCell>
            <TableCell>
              {count(row.views)}
              {row.early && (
                <span className="ms-1.5 text-[13px] text-muted-foreground">
                  {t.early}
                </span>
              )}
            </TableCell>
            <TableCell>
              {row.averageViewPercentage === null
                ? "—"
                : percent.format(Math.round(row.averageViewPercentage) / 100)}
            </TableCell>
            <TableCell>{count(row.viewsDay1)}</TableCell>
            <TableCell>{count(row.viewsDay7)}</TableCell>
            <TableCell>{count(row.viewsDay28)}</TableCell>
            <TableCell>
              {row.relative === null
                ? "—"
                : t.relative(ratio.format(row.relative))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
