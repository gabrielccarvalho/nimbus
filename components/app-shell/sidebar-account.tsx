"use client"

import {
  CaretUpDownIcon,
  CreditCardIcon,
  KeyboardIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  UserCircleIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { authClient } from "@/components/auth/auth-client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DotMeter } from "@/components/ui/dot-meter"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

import { useHotkey } from "./use-hotkey"

export type SidebarAccount = {
  name: string
  email: string
  initials: string
}

export type SidebarWorkspace = {
  name: string
  initials: string
  planName: string
}

export type SidebarUsage = {
  renderMinutes: number
  renderMinutesLimit: number | null
  resetsAt: string
}

export const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Search recordings and clips" },
  { keys: ["N"], label: "New project" },
  { keys: [","], label: "Settings" },
  { keys: ["?"], label: "Keyboard shortcuts" },
] as const

const resets = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export function WorkspaceButton({
  workspace,
  collapsed,
}: {
  workspace: SidebarWorkspace
  collapsed: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[14px] p-2 text-start transition-colors hover:bg-glass aria-expanded:bg-glass",
          collapsed && "md:justify-center md:p-1"
        )}
      >
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-graphite-3 text-[13px] font-semibold text-lav inset-ring-1 inset-ring-lav/45">
          {workspace.initials}
        </span>
        <span
          className={cn(
            "grid min-w-0 flex-1 gap-px",
            collapsed && "md:sr-only"
          )}
        >
          <span className="truncate text-sm font-semibold">
            {workspace.name}
          </span>
          <span className="truncate text-xs text-tertiary">
            Personal · {workspace.planName} plan
          </span>
        </span>
        <CaretUpDownIcon
          className={cn(
            "size-4 shrink-0 text-tertiary",
            collapsed && "md:hidden"
          )}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/settings/workspace" />}>
            <span className="grid size-5 place-items-center rounded-md bg-graphite-3 text-[10px] font-semibold text-lav">
              {workspace.initials}
            </span>
            {workspace.name}
            <DropdownMenuShortcut>Current</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/workspace" />}>
          <SlidersHorizontalIcon aria-hidden />
          Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UsageCard({ usage }: { usage: SidebarUsage }) {
  const limit = usage.renderMinutesLimit
  return (
    <div className="grid gap-2.5 rounded-[14px] bg-graphite p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">Render minutes</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {limit === null
            ? `${usage.renderMinutes} · Unlimited`
            : `${usage.renderMinutes} / ${limit}`}
        </span>
      </div>
      {limit !== null && (
        <DotMeter
          value={usage.renderMinutes}
          max={limit}
          tone={usage.renderMinutes >= limit ? "amber" : "lav"}
          aria-label="Render minutes used this month"
        />
      )}
      <div className="flex justify-between gap-2 text-xs text-tertiary">
        <span>Resets {resets.format(new Date(usage.resetsAt))}</span>
        <Link
          href="/settings/plan"
          className="text-muted-foreground hover:text-foreground"
        >
          Plan
        </Link>
      </div>
    </div>
  )
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work anywhere outside a text field.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-1">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between gap-4 py-1.5 text-sm"
            >
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

export function AccountMenu({
  account,
  collapsed,
}: {
  account: SidebarAccount
  collapsed: boolean
}) {
  const router = useRouter()
  const [shortcuts, setShortcuts] = React.useState(false)

  useHotkey(",", () => router.push("/settings"))
  useHotkey("?", () => setShortcuts(true))

  const signOut = async () => {
    await authClient.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "mt-2 flex w-full items-center gap-2.5 rounded-[14px] p-2 text-start transition-colors hover:bg-glass aria-expanded:bg-glass",
            collapsed && "md:justify-center md:p-1"
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-160 from-violet to-violet-deep text-[13px] font-semibold text-white">
            {account.initials}
          </span>
          <span
            className={cn(
              "grid min-w-0 flex-1 gap-px",
              collapsed && "md:sr-only"
            )}
          >
            <span className="truncate text-sm font-semibold">
              {account.name}
            </span>
            <span className="truncate text-xs text-tertiary">
              {account.email}
            </span>
          </span>
          <CaretUpDownIcon
            className={cn(
              "size-4 shrink-0 text-tertiary",
              collapsed && "md:hidden"
            )}
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="grid gap-0.5 px-2.5 pt-2 pb-2.5">
              <span className="text-sm font-semibold text-foreground">
                {account.name}
              </span>
              <span className="text-[12.5px] font-normal text-tertiary normal-case">
                {account.email}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
            <UserCircleIcon aria-hidden />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/plan" />}>
            <CreditCardIcon aria-hidden />
            Plan & usage
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <SlidersHorizontalIcon aria-hidden />
            Settings
            <DropdownMenuShortcut>,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcuts(true)}>
            <KeyboardIcon aria-hidden />
            Keyboard shortcuts
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <SignOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
    </>
  )
}
