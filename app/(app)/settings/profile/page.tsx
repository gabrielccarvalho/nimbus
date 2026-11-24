import type { Metadata } from "next"

import { ProfileName } from "@/components/settings/account-settings"
import { AvatarField } from "@/components/settings/avatar-field"
import {
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getProfileSettings } from "@/features/accounts/queries"
import { initials } from "@/features/accounts/schema"

export const metadata: Metadata = { title: "Profile" }

const since = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" })

export default async function ProfilePage() {
  const profile = await getProfileSettings()
  return (
    <SettingsSection>
      <SettingsSectionHeader title="Profile" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvatarField
          target="user"
          image={profile.image}
          initials={initials(profile.name)}
          label="Photo"
        />
        <span className="text-[13px] text-tertiary">
          Member since {since.format(profile.memberSince)}
        </span>
      </div>
      <ProfileName name={profile.name} />
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" value={profile.email} readOnly />
        <FieldDescription>Used to sign in.</FieldDescription>
      </Field>
    </SettingsSection>
  )
}
