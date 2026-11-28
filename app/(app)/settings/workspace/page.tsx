import type { Metadata } from "next"

import {
  ApiKeyRow,
  WorkspaceName,
} from "@/components/settings/account-settings"
import { AvatarField } from "@/components/settings/avatar-field"
import { settings } from "@/components/settings/messages"
import {
  SettingRow,
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { StatusPill } from "@/components/ui/status-pill"
import { getWorkspaceSettings } from "@/features/accounts/queries"
import { getMessages } from "@/lib/i18n/server"

import { initials } from "@/features/accounts/schema"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.workspace }
}

export default async function WorkspacePage() {
  const [workspace, t] = await Promise.all([
    getWorkspaceSettings(),
    getMessages(settings),
  ])
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t.nav.general}
        description={t.workspace.description}
      />
      <AvatarField
        target="workspace"
        image={workspace.image}
        initials={initials(workspace.name)}
        shape="square"
      />
      <WorkspaceName name={workspace.name} />
      <ApiKeyRow provider="claude" keyHint={workspace.keyHint} />
      <ApiKeyRow provider="groq" keyHint={workspace.groqKeyHint} />
      <SettingRow
        title={t.workspace.members}
        description={t.workspace.membersHint}
        className="pb-0 shadow-none"
      >
        <StatusPill tone="neutral">{t.soon}</StatusPill>
      </SettingRow>
    </SettingsSection>
  )
}
