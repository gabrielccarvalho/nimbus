"use client"

import { ArrowDownIcon, ArrowUpIcon, VideoIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ShortRow } from "@/features/analytics/queries"

type SortKey = "publishedAt" | "views" | "averageViewPercentage" | "relative"
type Direction = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "publishedAt", label: "Published" },
  { key: "views", label: "Views" },
  { key: "averageViewPercentage", label: "Watched" },
  { key: "relative", label: "Relative" },
]

const views = new Intl.NumberFormat("en")
const day = new Intl.DateTimeFormat("en", { dateStyle: "medium" })

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

export function PublishedClips({ rows }: { rows: ShortRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction }>({
    key: "publishedAt",
    dir: "desc",
  })
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])

  if (rows.length === 0) {
    return (
      <Empty className="rounded-[18px] bg-graphite">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <VideoIcon />
          </EmptyMedia>
          <EmptyDescription>
            Published clips show up here with their numbers.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Clip</TableHead>
          {COLUMNS.map(({ key, label }) => {
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
                  {label}
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
          <TableRow key={row.publicationId}>
            <TableCell className="max-w-72 truncate">
              {row.clipId && row.projectId ? (
                <Link
                  href={`/projects/${row.projectId}/clips/${row.clipId}`}
                  className="font-medium hover:underline"
                >
                  {row.title}
                </Link>
              ) : (
                <a
                  href={row.url ?? undefined}
                  className="font-medium hover:underline"
                >
                  {row.title}
                </a>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {day.format(row.publishedAt)}
            </TableCell>
            <TableCell>
              {row.views === null ? "—" : views.format(row.views)}
              {row.early && (
                <span className="ms-1.5 text-[13px] text-muted-foreground">
                  still coming in
                </span>
              )}
            </TableCell>
            <TableCell>
              {row.averageViewPercentage === null
                ? "—"
                : `${Math.round(row.averageViewPercentage)}%`}
            </TableCell>
            <TableCell>
              {row.relative === null
                ? "—"
                : `${row.relative.toFixed(1)}× usual`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
