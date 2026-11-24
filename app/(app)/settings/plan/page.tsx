import type { Metadata } from "next"

import {
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/section"
import { DotMeter } from "@/components/ui/dot-meter"
import { getPlanSettings } from "@/features/accounts/queries"
import { formatBytes } from "@/lib/format"

export const metadata: Metadata = { title: "Plan & usage" }

const day = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

function Meter({
  label,
  value,
  max,
  display,
  limit,
}: {
  label: string
  value: number
  max: number | null
  display: string
  limit: string
}) {
  return (
    <div className="grid gap-2.5 rounded-[14px] bg-graphite-2 p-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-semibold tracking-[-0.03em] tabular-nums">
        {display}{" "}
        <span className="text-sm font-normal text-tertiary">
          {max === null ? "· Unlimited" : `/ ${limit}`}
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

export default async function PlanPage() {
  const usage = await getPlanSettings()
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Plan & usage"
        description={
          usage.plan.id === "admin"
            ? `Admin plan · resets ${day.format(usage.resetsAt)}. No limits; usage is still tracked.`
            : `${usage.plan.name} plan · resets ${day.format(usage.resetsAt)}. Usage is tracked but not limited; billing isn't set up yet.`
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Meter
          label="Render minutes"
          value={usage.renderMinutes}
          max={usage.plan.renderMinutes}
          display={String(usage.renderMinutes)}
          limit={String(usage.plan.renderMinutes)}
        />
        <Meter
          label="Storage"
          value={usage.storageBytes}
          max={usage.plan.storageBytes}
          display={formatBytes(usage.storageBytes)}
          limit={formatBytes(usage.plan.storageBytes ?? 0)}
        />
        <Meter
          label="Highlight runs with Claude"
          value={usage.claudeRuns}
          max={usage.plan.claudeRuns}
          display={String(usage.claudeRuns)}
          limit={String(usage.plan.claudeRuns)}
        />
      </div>
    </SettingsSection>
  )
}
