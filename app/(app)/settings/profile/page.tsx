import type { Metadata } from "next"

import { ProfileName } from "@/components/settings/account-settings"
import { AvatarField } from "@/components/settings/avatar-field"
import { LocaleSelect } from "@/components/settings/locale-select"
import { settings } from "@/components/settings/messages"
import {
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { getProfileSettings } from "@/features/accounts/queries"
import { initials } from "@/features/accounts/schema"
import { common } from "@/lib/i18n/common"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).profile.title }
}

export default async function ProfilePage() {
  const [profile, locale] = await Promise.all([
    getProfileSettings(),
    getLocale(),
  ])
  const t = settings[locale].profile
  const since = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  })
  return (
    <SettingsSection>
      <SettingsSectionHeader title={t.title} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvatarField
          target="user"
          image={profile.image}
          initials={initials(profile.name)}
        />
        <span className="text-[13px] text-tertiary">
          {t.memberSince(since.format(profile.memberSince))}
        </span>
      </div>
      <ProfileName name={profile.name} />
      <Field>
        <FieldLabel htmlFor="email">{t.email}</FieldLabel>
        <Input id="email" value={profile.email} readOnly />
        <FieldDescription>{t.emailHint}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="language">{common[locale].language}</FieldLabel>
        <LocaleSelect id="language" className="w-full sm:w-64" />
        <FieldDescription>{t.languageHint}</FieldDescription>
      </Field>
    </SettingsSection>
  )
}
