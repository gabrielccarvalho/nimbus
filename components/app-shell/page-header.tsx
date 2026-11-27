"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { SegmentedLink, SegmentedNav } from "@/components/ui/segmented"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function PageHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "z-30 flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 bg-background px-4 py-2 shadow-[inset_0_-1px_0_var(--hair)] has-data-[slot=page-header-back]:ps-2.5 md:sticky md:top-0",
        className
      )}
      {...props}
    />
  )
}

export function PageHeaderBack({
  href,
  label,
  className,
}: {
  href: Route
  label: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            data-slot="page-header-back"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              className
            )}
          />
        }
      >
        <ArrowLeftIcon aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function PageHeaderHeading({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-heading"
      className={cn("grid min-w-0 flex-[1_1_200px] gap-0.5", className)}
      {...props}
    />
  )
}

export function PageHeaderContext({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="page-header-context"
      className={cn("truncate text-xs text-tertiary", className)}
      {...props}
    />
  )
}

export function PageHeaderTitleLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-title-line"
      className={cn("flex min-w-0 items-baseline gap-1.5", className)}
      {...props}
    />
  )
}

export function PageHeaderTitle({
  className,
  ...props
}: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        "truncate text-base leading-tight font-semibold tracking-[-0.02em]",
        className
      )}
      {...props}
    />
  )
}

export function PageHeaderState({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="page-header-state"
      className={cn(
        "flex shrink-0 items-baseline gap-1.5 text-xs text-tertiary",
        className
      )}
      {...props}
    />
  )
}

export type PageHeaderTab = {
  href: Route
  label: string
  count?: number
  exact?: boolean
}

export function PageHeaderTabs({
  tabs,
  className,
  ...props
}: Omit<React.ComponentProps<typeof SegmentedNav>, "children"> & {
  tabs: readonly PageHeaderTab[]
}) {
  const pathname = usePathname()
  return (
    <SegmentedNav
      data-slot="page-header-tabs"
      className={cn("shrink-0", className)}
      {...props}
    >
      {tabs.map((tab) => (
        <SegmentedLink
          key={tab.href}
          current={
            tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          }
          render={<Link href={tab.href} />}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="font-mono text-[11px] font-semibold text-tertiary tabular-nums">
              {tab.count}
            </span>
          )}
        </SegmentedLink>
      ))}
    </SegmentedNav>
  )
}

export function PageHeaderDivider({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="page-header-divider"
      className={cn("h-6 w-px shrink-0 bg-hair", className)}
      {...props}
    />
  )
}

export function PageHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      {...props}
    />
  )
}
