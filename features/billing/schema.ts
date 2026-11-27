import { z } from "zod"

export const CREATOR_PRICE_CENTS = 6769

// AbacatePay retries a failed renewal for 3 days by default; a few more cover
// a late webhook before the plan lapses.
export const RENEWAL_GRACE_DAYS = 4

const checkoutSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

const subscriptionEventSchema = z.object({
  id: z.string().min(1),
  event: z.enum([
    "subscription.completed",
    "subscription.renewed",
    "subscription.cancelled",
  ]),
  data: z.object({
    subscription: z.object({
      id: z.string().min(1),
      cancelPolicy: z.enum(["NOW", "NEXT_CYCLE"]).nullish(),
    }),
    customer: z.object({ id: z.string().min(1) }).nullish(),
    checkout: checkoutSchema,
    payment: z.object({ createdAt: z.coerce.date() }).nullish(),
  }),
})

const otherEventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
})

export type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>

export function parseBillingEvent(body: unknown) {
  const subscription = subscriptionEventSchema.safeParse(body)
  if (subscription.success) return subscription.data
  const other = otherEventSchema.safeParse(body)
  return other.success ? { ...other.data, data: null } : null
}

export type BillingChange =
  | {
      kind: "activate"
      customerId: string | null
      checkoutId: string
      subscriptionId: string
      paidThrough: Date
    }
  | { kind: "cancel"; at: Date; immediately: boolean }

export function addMonth(date: Date) {
  const next = new Date(date)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const last = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate()
  next.setUTCDate(Math.min(day, last))
  return next
}

export function paidThrough(paidAt: Date) {
  return new Date(addMonth(paidAt).getTime() + RENEWAL_GRACE_DAYS * 86_400_000)
}

export function billingChange(
  event: SubscriptionEvent,
  now: Date
): BillingChange {
  const { subscription, customer, checkout, payment } = event.data
  if (event.event === "subscription.cancelled") {
    return {
      kind: "cancel",
      at: now,
      immediately: subscription.cancelPolicy !== "NEXT_CYCLE",
    }
  }
  return {
    kind: "activate",
    customerId: customer?.id ?? checkout.customerId ?? null,
    checkoutId: checkout.id,
    subscriptionId: subscription.id,
    paidThrough: paidThrough(payment?.createdAt ?? now),
  }
}

export function eventWorkspaceId(event: SubscriptionEvent) {
  const id = event.data.checkout.metadata?.workspaceId
  return typeof id === "string" && id.length > 0 ? id : null
}
