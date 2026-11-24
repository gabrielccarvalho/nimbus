"use client"

import {
  FolderSimpleIcon,
  GearSixIcon,
  PlusIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"

import {
  projectSignal,
  type ProjectSignalInput,
} from "@/components/projects/status-badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { SignalDot } from "@/components/ui/signal-dot"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { Logo, LogoMark } from "./logo"
import { SIDEBAR_COOKIE } from "./sidebar-cookie"
import { useHotkey } from "./use-hotkey"

export type RecentProject = ProjectSignalInput & { id: string; name: string }

type NavItem = {
  href: "/" | "/settings"
  label: string
  icon: React.ElementType
  count?: number
  active: boolean
}

function SidebarLink({
  item,
  collapsed,
}: {
  item: NavItem
  collapsed: boolean
}) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex h-[38px] items-center gap-[11px] rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-[current=page]:bg-glass-2 aria-[current=page]:text-foreground aria-[current=page]:inset-ring-1 aria-[current=page]:inset-ring-hair",
        collapsed && "md:justify-center md:px-0"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className={cn("flex-1", collapsed && "md:sr-only")}>
        {item.label}
      </span>
      {item.count !== undefined && (
        <span
          className={cn(
            "font-mono text-[11px] font-semibold text-tertiary",
            collapsed && "md:hidden"
          )}
        >
          {item.count}
        </span>
      )}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" className="max-md:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({
  recent,
  projectCount,
  defaultCollapsed = false,
}: {
  recent: RecentProject[]
  projectCount: number
  defaultCollapsed?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [openedAt, setOpenedAt] = React.useState(pathname)

  if (openedAt !== pathname) {
    setOpenedAt(pathname)
    setMobileOpen(false)
  }

  useHotkey("n", () => router.push("/#import"))

  const toggle = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      const next = !collapsed
      setCollapsed(next)
      document.cookie = `${SIDEBAR_COOKIE}=${!next}; path=/; max-age=31536000; samesite=lax`
    } else {
      setMobileOpen((open) => !open)
    }
  }

  const nav: NavItem[] = [
    {
      href: "/",
      label: "Projects",
      icon: FolderSimpleIcon,
      count: projectCount,
      active: pathname === "/",
    },
  ]
  const settings: NavItem = {
    href: "/settings",
    label: "Settings",
    icon: GearSixIcon,
    active: pathname === "/settings",
  }

  return (
    <aside
      aria-label="Main navigation"
      data-slot="sidebar"
      data-state={collapsed ? "collapsed" : "expanded"}
      data-mobile-open={mobileOpen}
      className={cn(
        "group/sidebar flex shrink-0 flex-col gap-1 bg-background px-3 pt-3.5 pb-3 shadow-[inset_0_-1px_0_var(--hair)] md:sticky md:top-0 md:h-svh md:w-[260px] md:overflow-y-auto md:shadow-[inset_-1px_0_0_var(--hair)]",
        "transition-[width] duration-300 ease-snappy",
        collapsed && "md:w-[68px] md:px-2.5"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          collapsed && "md:flex-col md:gap-2"
        )}
      >
        <Link
          href="/"
          aria-label="nimbus, all projects"
          className="flex-1 rounded-lg py-1 ps-2.5 pe-1.5 pb-2.5 md:pb-2.5"
        >
          <Logo className={cn(collapsed && "md:hidden")} />
          {collapsed && <LogoMark className="max-md:hidden" />}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={toggle}
          className="max-md:hidden"
        >
          <SidebarSimpleIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={toggle}
          className="md:hidden"
        >
          <SidebarSimpleIcon aria-hidden />
        </Button>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col gap-1 max-md:hidden max-md:group-data-[mobile-open=true]/sidebar:flex"
        )}
      >
        <Link
          href="/#import"
          aria-keyshortcuts="n"
          aria-label={collapsed ? "New project" : undefined}
          className={cn(
            "mt-1.5 mb-2.5 flex h-10 items-center gap-2.5 rounded-full bg-glass-2 ps-3 pe-2.5 text-sm font-semibold inset-ring-1 inset-ring-white/10 transition-colors hover:bg-glass-3",
            collapsed && "md:justify-center md:px-0"
          )}
        >
          <PlusIcon className="size-4 shrink-0" aria-hidden />
          <span className={cn("flex-1", collapsed && "md:hidden")}>
            New project
          </span>
          <Kbd className={cn(collapsed && "md:hidden")}>N</Kbd>
        </Link>

        <nav aria-label="Sections" className="grid gap-0.5">
          {nav.map((item) => (
            <SidebarLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {recent.length > 0 && (
          <div className={cn("flex flex-col", collapsed && "md:hidden")}>
            <p className="px-2.5 pt-[18px] pb-1.5 mono-label">Recent</p>
            <ul className="grid gap-0.5">
              {recent.map((project) => {
                const signal = projectSignal(project)
                const href = `/projects/${project.id}` as const
                const active = pathname.startsWith(href)
                return (
                  <li key={project.id}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13.5px] text-muted-foreground transition-colors hover:bg-glass hover:text-foreground aria-[current=page]:bg-glass aria-[current=page]:text-foreground"
                    >
                      <SignalDot tone={signal.tone} lit={signal.needsYou} />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate">{project.name}</span>
                        <small className="truncate text-xs text-tertiary">
                          {signal.label}
                          {signal.detail && ` · ${signal.detail.toLowerCase()}`}
                        </small>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="min-h-6 flex-1" />
        <SidebarLink item={settings} collapsed={collapsed} />
      </div>
    </aside>
  )
}
