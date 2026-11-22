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

type Labels = Record<string, string>

const BreadcrumbLabelsContext = React.createContext<{
  labels: Labels
  setLabel: (segment: string, label: string | null) => void
} | null>(null)

const STATIC_LABELS: Labels = {
  projects: "Projects",
  settings: "Settings",
  transcript: "Transcript",
  "layout-editor": "Layout",
  clips: "Clips",
}

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
  const crumbs = [{ href: "/", label: "Projects" }]
  segments.forEach((segment, index) => {
    if (segment === "projects") return
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
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {last ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={crumb.href as "/"} />}
                    className="truncate"
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
