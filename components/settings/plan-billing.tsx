"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  billingPortalAction,
  startCreatorCheckoutAction,
} from "@/features/billing/actions"
import type { BillingSettings } from "@/features/billing/queries"
import { CREATOR_PRICE_CENTS } from "@/features/billing/schema"
import type { Result } from "@/lib/errors"
import { common } from "@/lib/i18n/common"
import { useLocale, useMessages } from "@/lib/i18n/client"

import { settings } from "./messages"
import { SettingRow, SettingsSection, SettingsSectionHeader } from "./section"

export function PlanBilling({
  billing,
  pending,
}: {
  billing: BillingSettings
  pending: boolean
}) {
  const locale = useLocale()
  const t = useMessages(settings).plan.billing
  const fallback = useMessages(common).failed
  const [busy, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  if (billing.status === "none") return null

  const go = (action: () => Promise<Result<string>>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        window.location.assign(result.value)
        return
      }
      setError(result.error.message || fallback)
    })
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(CREATOR_PRICE_CENTS / 100)
  const date = billing.paidUntil
    ? new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(billing.paidUntil)
    : ""

  return (
    <SettingsSection aria-labelledby="billing-title">
      <SettingsSectionHeader id="billing-title" title={t.title} />
      <div>
        {billing.status === "can_upgrade" ? (
          <SettingRow
            title={t.creator(price)}
            description={pending ? t.pending : t.creatorPerks}
          >
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => go(startCreatorCheckoutAction)}
            >
              {t.upgrade}
            </Button>
          </SettingRow>
        ) : (
          <SettingRow
            title={t.creator(price)}
            description={`${
              billing.status === "active" ? t.active(date) : t.ending(date)
            } ${t.manageHint}`}
          >
            <Button disabled={busy} onClick={() => go(billingPortalAction)}>
              {t.manage}
            </Button>
          </SettingRow>
        )}
        {error && (
          <p role="alert" className="pt-3 text-[13px] text-amber">
            {error}
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
