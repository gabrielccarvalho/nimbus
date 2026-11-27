import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"
import type { Route } from "next"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The 60 px page header every signed-in page starts with (docs/UX_PATTERNS.md):
 * back, context line over the title, state, section tabs, secondary actions,
 * then the one primary action.
 */
function AppHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-header"
      className={cn(
        "flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm shadow-[inset_0_-1px_0_var(--hair)] has-data-[slot=app-header-back]:ps-2.5",
        className
      )}
      {...props}
    />
  )
}

function AppHeaderBack({
  href,
  label,
  className,
}: {
  href: Route
  label: string
  className?: string
}) {
  return (
    <Link
      data-slot="app-header-back"
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "shrink-0",
        className
      )}
    >
      <ArrowLeftIcon aria-hidden />
    </Link>
  )
}

function AppHeaderHeading({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-header-heading"
      className={cn("grid min-w-0 flex-[1_1_220px] gap-0.5", className)}
      {...props}
    />
  )
}

function AppHeaderContext({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="app-header-context"
      className={cn("truncate text-xs text-tertiary", className)}
      {...props}
    />
  )
}

function AppHeaderTitleRow({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-header-title-row"
      className={cn("flex min-w-0 items-center gap-2", className)}
      {...props}
    />
  )
}

function AppHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="app-header-title"
      className={cn(
        "truncate text-base leading-tight font-semibold tracking-[-0.02em]",
        className
      )}
      {...props}
    />
  )
}

function AppHeaderState({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="app-header-state"
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-tertiary",
        className
      )}
      {...props}
    />
  )
}

function AppHeaderTabs({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="app-header-tabs"
      className={cn(
        "flex shrink-0 gap-0.5 rounded-full bg-glass p-[3px] inset-ring-1 inset-ring-hair",
        className
      )}
      {...props}
    />
  )
}

function AppHeaderTab({
  href,
  active = false,
  count,
  className,
  children,
}: {
  href: Route
  active?: boolean
  count?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      data-slot="app-header-tab"
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-[30px] items-center gap-[7px] rounded-full px-3 text-[13.5px] leading-none font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground aria-[current=page]:bg-white/14 aria-[current=page]:text-foreground aria-[current=page]:inset-ring-1 aria-[current=page]:inset-ring-white/10",
        className
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="font-mono text-[11px] font-semibold tabular-nums">
          {count}
        </span>
      )}
    </Link>
  )
}

function AppHeaderDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="app-header-divider"
      className={cn("h-6 w-px shrink-0 bg-hair max-sm:hidden", className)}
    />
  )
}

function AppHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-header-actions"
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  AppHeader,
  AppHeaderActions,
  AppHeaderBack,
  AppHeaderContext,
  AppHeaderDivider,
  AppHeaderHeading,
  AppHeaderState,
  AppHeaderTab,
  AppHeaderTabs,
  AppHeaderTitle,
  AppHeaderTitleRow,
}
