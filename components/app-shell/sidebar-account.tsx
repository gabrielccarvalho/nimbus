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

import { EntityAvatar } from "./entity-avatar"
import { useHotkey } from "./use-hotkey"

export type SidebarAccount = {
  name: string
  email: string
  initials: string
  image: string | null
}

export type SidebarWorkspace = {
  name: string
  initials: string
  image: string | null
  planName: string
}

export const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Search recordings and clips" },
  { keys: ["N"], label: "New project" },
  { keys: [","], label: "Settings" },
  { keys: ["?"], label: "Keyboard shortcuts" },
] as const

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
        <EntityAvatar
          image={workspace.image}
          initials={workspace.initials}
          shape="square"
          className="size-[30px] text-[13px]"
        />
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
            <EntityAvatar
              image={workspace.image}
              initials={workspace.initials}
              shape="square"
              className="size-5 text-[10px]"
            />
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

  useHotkey(",", () => router.push("/settings/profile"))
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
          <EntityAvatar
            image={account.image}
            initials={account.initials}
            className="size-8 text-[13px]"
          />
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
          <DropdownMenuItem render={<Link href="/settings/workspace/plan" />}>
            <CreditCardIcon aria-hidden />
            Plan & usage
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
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
