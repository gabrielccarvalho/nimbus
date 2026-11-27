"use client"

import { usePathname } from "next/navigation"

import {
  AppHeader,
  AppHeaderActions,
  AppHeaderContext,
  AppHeaderHeading,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "@/components/app-shell/app-header"
import {
  AppHeaderSlot,
  HEADER_STATE_SLOT_ID,
} from "@/components/app-shell/header-slot"

import { SETTINGS_GROUPS } from "./settings-nav"

export function SettingsHeader() {
  const pathname = usePathname()
  const group = SETTINGS_GROUPS.find((item) =>
    item.items.some((link) => link.href === pathname)
  )
  const current = group?.items.find((link) => link.href === pathname)
  return (
    <AppHeader>
      <AppHeaderHeading>
        <AppHeaderContext>
          Settings{group ? ` · ${group.label}` : ""}
          {group?.label === "Workspace" ? " · applies to new projects" : ""}
        </AppHeaderContext>
        <AppHeaderTitleRow>
          <AppHeaderTitle>{current?.label ?? "Settings"}</AppHeaderTitle>
          <span id={HEADER_STATE_SLOT_ID} className="contents" />
        </AppHeaderTitleRow>
      </AppHeaderHeading>
      <AppHeaderActions>
        <AppHeaderSlot />
      </AppHeaderActions>
    </AppHeader>
  )
}
