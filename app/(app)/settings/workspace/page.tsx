import type { Metadata } from "next"

import { WorkspaceName } from "@/components/settings/account-settings"
import {
  SettingRow,
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { StatusPill } from "@/components/ui/status-pill"
import { getWorkspaceSettings } from "@/features/accounts/queries"

export const metadata: Metadata = { title: "Workspace" }

export default async function WorkspacePage() {
  const workspace = await getWorkspaceSettings()
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Workspace"
        description="Projects, defaults and the Claude key belong to the workspace."
      />
      <WorkspaceName name={workspace.name} />
      <SettingRow
        title="Members"
        description="Personal workspace. Inviting people comes later."
        className="pb-0 shadow-none"
      >
        <StatusPill tone="neutral">Soon</StatusPill>
      </SettingRow>
    </SettingsSection>
  )
}
