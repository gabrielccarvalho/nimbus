import type { Metadata } from "next"

import { ProfileName } from "@/components/settings/account-settings"
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
      <div className="flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-full bg-linear-160 from-violet to-violet-deep text-[22px] font-semibold text-white">
          {initials(profile.name)}
        </span>
        <div className="grid gap-0.5">
          <b className="font-semibold">{profile.name}</b>
          <span className="text-[13px] text-tertiary">
            Member since {since.format(profile.memberSince)}
          </span>
        </div>
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
