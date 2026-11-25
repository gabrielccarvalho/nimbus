"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/shorts", label: "Shorts" },
  { href: "/analytics/insights", label: "Insights" },
] as const

export function AnalyticsNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Analytics sections"
      className="-mx-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--hair)]"
    >
      <ul className="flex w-max gap-0.5 px-1 pb-2.5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/analytics"
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
          return (
            <li key={tab.href}>
              <Link
                href={tab.href as "/"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm leading-tight font-medium tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:bg-glass hover:text-foreground",
                  active && "bg-glass-3 text-foreground hover:bg-glass-3"
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
