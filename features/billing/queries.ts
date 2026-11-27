import "server-only"

import { connection } from "next/server"

import { requireViewer } from "../accounts/session"
import { billingEnabled } from "./client"
import { RENEWAL_GRACE_DAYS } from "./schema"
import { hasActiveSubscription } from "./service"

export async function getBillingSettings() {
  await connection()
  const { workspace } = await requireViewer()
  const paidUntil = workspace.planPaidThrough
    ? new Date(
        workspace.planPaidThrough.getTime() - RENEWAL_GRACE_DAYS * 86_400_000
      )
    : null
  const subscribed =
    Boolean(workspace.billingSubscriptionId) && workspace.plan === "creator"
  return {
    status: !subscribed
      ? workspace.plan === "free" && billingEnabled()
        ? ("can_upgrade" as const)
        : ("none" as const)
      : hasActiveSubscription(workspace)
        ? ("active" as const)
        : ("ending" as const),
    paidUntil,
  }
}

export type BillingSettings = Awaited<ReturnType<typeof getBillingSettings>>
