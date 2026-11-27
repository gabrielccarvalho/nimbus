import type { Metadata } from "next"

import { settings } from "@/components/settings/messages"
import { PlanBilling } from "@/components/settings/plan-billing"
import {
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { DotMeter } from "@/components/ui/dot-meter"
import { getPlanSettings } from "@/features/accounts/queries"
import { getBillingSettings } from "@/features/billing/queries"
import { formatBytes } from "@/lib/format"
import { getLocale, getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settings)).nav.plan }
}

function Meter({
  label,
  value,
  max,
  display,
  limit,
  unlimited,
}: {
  label: string
  value: number
  max: number | null
  display: string
  limit: string
  unlimited: string
}) {
  return (
    <div className="grid gap-2.5 rounded-[14px] bg-graphite-2 p-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-semibold tracking-[-0.03em] tabular-nums">
        {display}{" "}
        <span className="text-sm font-normal text-tertiary">
          {max === null ? `· ${unlimited}` : `/ ${limit}`}
        </span>
      </span>
      {max !== null && (
        <DotMeter
          value={value}
          max={max}
          tone={value >= max ? "amber" : "lav"}
          aria-label={label}
        />
      )}
    </div>
  )
}

export default async function PlanPage({
  searchParams,
}: PageProps<"/settings/workspace/plan">) {
  const [usage, billing, locale, { checkout }] = await Promise.all([
    getPlanSettings(),
    getBillingSettings(),
    getLocale(),
    searchParams,
  ])
  const t = settings[locale].plan
  const resets = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(usage.resetsAt)
  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          title={settings[locale].nav.plan}
          description={
            usage.plan.id === "admin"
              ? t.adminSummary(resets)
              : t.summary(t.names[usage.plan.id] ?? usage.plan.name, resets)
          }
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <Meter
            label={t.renderMinutes}
            value={usage.renderMinutes}
            max={usage.plan.renderMinutes}
            display={String(usage.renderMinutes)}
            limit={String(usage.plan.renderMinutes)}
            unlimited={t.unlimited}
          />
          <Meter
            label={t.storage}
            value={usage.storageBytes}
            max={usage.plan.storageBytes}
            display={formatBytes(usage.storageBytes, locale)}
            limit={formatBytes(usage.plan.storageBytes ?? 0, locale)}
            unlimited={t.unlimited}
          />
          <Meter
            label={t.claudeRuns}
            value={usage.claudeRuns}
            max={usage.plan.claudeRuns}
            display={String(usage.claudeRuns)}
            limit={String(usage.plan.claudeRuns)}
            unlimited={t.unlimited}
          />
          <div className="grid gap-2.5 rounded-[14px] bg-graphite-2 p-4">
            <span className="text-[13px] text-muted-foreground">
              {t.publishesToday}
            </span>
            <span className="font-mono text-2xl font-semibold tracking-[-0.03em] tabular-nums">
              {usage.plan.publishesPerDay === null
                ? t.noLimit
                : t.publishes(usage.publishesToday, usage.plan.publishesPerDay)}
            </span>
          </div>
        </div>
      </SettingsSection>
      <PlanBilling billing={billing} pending={checkout === "done"} />
    </>
  )
}
