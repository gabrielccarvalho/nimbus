"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useMessages } from "@/lib/i18n/client"

import { settings } from "./messages"

const GROUPS = [
  {
    label: "account",
    items: [
      { href: "/settings/profile", label: "profile" },
      { href: "/settings/channels", label: "channels" },
      { href: "/settings/security", label: "security" },
    ],
  },
  {
    label: "workspace",
    items: [
      { href: "/settings/workspace", label: "general" },
      { href: "/settings/workspace/plan", label: "plan" },
      { href: "/settings/workspace/defaults", label: "defaults" },
      { href: "/settings/workspace/layout", label: "layout" },
      { href: "/settings/workspace/captions", label: "captions" },
      { href: "/settings/workspace/rendering", label: "rendering" },
      { href: "/settings/workspace/music", label: "music" },
    ],
  },
] as const

export function SettingsNav() {
  const pathname = usePathname()
  const t = useMessages(settings).nav
  return (
    <nav
      aria-label={t.sections}
      className="grid flex-[1_1_180px] content-start gap-0.5 md:sticky md:top-[84px] md:max-w-[220px]"
    >
      {GROUPS.map((group, index) => (
        <div key={group.label} className="contents">
          <p
            className={
              index === 0
                ? "px-2.5 pb-2 mono-label"
                : "px-2.5 pt-[18px] pb-2 mono-label"
            }
          >
            {t[group.label]}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={pathname === item.href ? "page" : undefined}
              className="flex h-[38px] items-center rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-[current=page]:bg-glass-2 aria-[current=page]:text-foreground aria-[current=page]:inset-ring-1 aria-[current=page]:inset-ring-hair"
            >
              {t[item.label]}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
