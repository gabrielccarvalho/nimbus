import type { Metadata } from "next"

import {
  ClaudeKeyRow,
  WorkspaceName,
} from "@/components/settings/account-settings"
import { AvatarField } from "@/components/settings/avatar-field"
import {
  SettingRow,
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { StatusPill } from "@/components/ui/status-pill"
import { getWorkspaceSettings } from "@/features/accounts/queries"

import { initials } from "@/features/accounts/schema"

export const metadata: Metadata = { title: "Workspace" }

export default async function WorkspacePage() {
  const workspace = await getWorkspaceSettings()
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="General"
        description="Projects, the plan, the Claude key and every default belong to the workspace."
      />
      <AvatarField
        target="workspace"
        image={workspace.image}
        initials={initials(workspace.name)}
        label="Logo"
        shape="square"
      />
      <WorkspaceName name={workspace.name} />
      <ClaudeKeyRow keyHint={workspace.keyHint} />
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
