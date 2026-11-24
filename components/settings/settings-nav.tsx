"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

const GROUPS = [
  {
    label: "Account",
    items: [
      { href: "/settings/profile", label: "Profile" },
      { href: "/settings/plan", label: "Plan & usage" },
      { href: "/settings/channels", label: "Connected channels" },
      { href: "/settings/security", label: "Sign-in & security" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/workspace", label: "Workspace" },
      { href: "/settings", label: "Project defaults" },
    ],
  },
] as const

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Settings sections"
      className="grid flex-[1_1_180px] content-start gap-0.5 md:sticky md:top-6 md:max-w-[220px]"
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
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={pathname === item.href ? "page" : undefined}
              className="flex h-[38px] items-center rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-[current=page]:bg-glass-2 aria-[current=page]:text-foreground aria-[current=page]:inset-ring-1 aria-[current=page]:inset-ring-hair"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
