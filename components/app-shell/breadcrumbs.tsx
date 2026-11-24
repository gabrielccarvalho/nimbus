"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"

type Labels = Record<string, string>

const BreadcrumbLabelsContext = React.createContext<{
  labels: Labels
  setLabel: (segment: string, label: string | null) => void
} | null>(null)

const STATIC_LABELS: Labels = {
  settings: "Settings",
  channels: "Channels",
  profile: "Profile",
  workspace: "Workspace",
  plan: "Plan & usage",
  security: "Sign-in & security",
}

const PROJECT_TABS = new Set(["transcript", "layout", "clips"])

export function BreadcrumbLabelsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [labels, setLabels] = React.useState<Labels>({})
  const setLabel = React.useCallback(
    (segment: string, label: string | null) => {
      setLabels((current) => {
        if (label === null) {
          const next = { ...current }
          delete next[segment]
          return next
        }
        return current[segment] === label
          ? current
          : { ...current, [segment]: label }
      })
    },
    []
  )
  const value = React.useMemo(() => ({ labels, setLabel }), [labels, setLabel])
  return (
    <BreadcrumbLabelsContext.Provider value={value}>
      {children}
    </BreadcrumbLabelsContext.Provider>
  )
}

export function BreadcrumbLabel({
  segment,
  label,
}: {
  segment: string
  label: string
}) {
  const context = React.useContext(BreadcrumbLabelsContext)
  const setLabel = context?.setLabel
  React.useEffect(() => {
    setLabel?.(segment, label)
    return () => setLabel?.(segment, null)
  }, [segment, label, setLabel])
  return null
}

export function buildCrumbs(pathname: string, labels: Labels) {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs =
    segments[0] === "settings" ? [] : [{ href: "/", label: "Projects" }]
  segments.forEach((segment, index) => {
    if (segment === "projects") return
    if (segments[0] === "projects" && PROJECT_TABS.has(segment)) return
    crumbs.push({
      href: `/${segments.slice(0, index + 1).join("/")}`,
      label: labels[segment] ?? STATIC_LABELS[segment] ?? "…",
    })
  })
  return crumbs
}

export function AppBreadcrumbs() {
  const pathname = usePathname()
  const labels = React.useContext(BreadcrumbLabelsContext)?.labels ?? {}
  const crumbs = buildCrumbs(pathname, labels)

  return (
    <Breadcrumb className="min-w-0 flex-[1_1_280px]">
      <BreadcrumbList className="flex-nowrap gap-2 text-[13.5px] text-tertiary sm:gap-2">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className={cn("min-w-0", !last && "shrink-0")}>
                {last ? (
                  <BreadcrumbPage className="truncate font-medium">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={crumb.href as "/"} />}
                    className="block max-w-[280px] truncate text-muted-foreground"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
