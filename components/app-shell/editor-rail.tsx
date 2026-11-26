"use client"

import {
  BroadcastIcon,
  ChartLineUpIcon,
  FolderSimpleIcon,
  KeyboardIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { LogoMark } from "./logo"
import {
  AccountMenu,
  ShortcutsDialog,
  SHORTCUTS,
  type Shortcut,
  type SidebarAccount,
} from "./sidebar-account"

const NAV = [
  { href: "/", label: "Projects", icon: FolderSimpleIcon, active: true },
  {
    href: "/analytics",
    label: "Analytics",
    icon: ChartLineUpIcon,
    active: false,
  },
  { href: "/channels", label: "Channels", icon: BroadcastIcon, active: false },
] as const

const railButton =
  "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-glass hover:text-foreground aria-[current=page]:bg-glass-2 aria-[current=page]:text-foreground [&_svg]:size-4"

export function EditorRail({
  account,
  shortcuts,
}: {
  account: SidebarAccount
  shortcuts: readonly Shortcut[]
}) {
  const [open, setOpen] = React.useState(false)
  const all = React.useMemo(() => [...shortcuts, ...SHORTCUTS], [shortcuts])

  return (
    <nav
      aria-label="Main navigation"
      data-slot="editor-rail"
      className="flex w-14 shrink-0 flex-col items-center gap-1 pt-3.5 pb-3 shadow-[inset_-1px_0_0_var(--hair)]"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/"
              aria-label="nimbus home"
              className="mb-2.5 grid size-9 place-items-center rounded-full"
            />
          }
        >
          <LogoMark />
        </TooltipTrigger>
        <TooltipContent side="right">nimbus home</TooltipContent>
      </Tooltip>
      {NAV.map((item) => (
        <Tooltip key={item.href}>
          <TooltipTrigger
            render={
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                className={railButton}
              />
            }
          >
            <item.icon aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ))}
      <span className="flex-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              className={cn(railButton)}
              onClick={() => setOpen(true)}
            />
          }
        >
          <KeyboardIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">Keyboard shortcuts</TooltipContent>
      </Tooltip>
      <AccountMenu account={account} collapsed iconOnly shortcuts={all} />
      <ShortcutsDialog open={open} onOpenChange={setOpen} shortcuts={all} />
    </nav>
  )
}
