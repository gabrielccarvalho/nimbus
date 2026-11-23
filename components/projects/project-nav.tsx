"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const SECTIONS = [
  { href: "", label: "Overview" },
  { href: "/transcript", label: "Transcript" },
  { href: "/layout-editor", label: "Layout" },
  { href: "/clips", label: "Clips" },
  { href: "/settings", label: "Settings" },
] as const

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`

  return (
    <nav aria-label="Project sections" className="-mx-1 overflow-x-auto">
      <ul className="flex w-max gap-1 border-b pb-2">
        {SECTIONS.map((section) => {
          const href = `${base}${section.href}`
          const active =
            section.href === "" ? pathname === base : pathname.startsWith(href)
          return (
            <li key={section.href}>
              <Link
                href={href as "/"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-muted text-foreground"
                )}
              >
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
