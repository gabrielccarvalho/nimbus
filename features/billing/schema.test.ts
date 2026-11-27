import { describe, expect, it } from "vitest"

import {
  addMonth,
  billingChange,
  eventWorkspaceId,
  paidThrough,
  parseBillingEvent,
  type SubscriptionEvent,
} from "./schema"

const now = new Date("2026-11-27T12:00:00Z")

function event(
  type: SubscriptionEvent["event"],
  overrides: Partial<SubscriptionEvent["data"]["subscription"]> = {}
) {
  return {
    id: "log_1",
    event: type,
    apiVersion: 2,
    devMode: true,
    data: {
      subscription: {
        id: "subs_1",
        status: "ACTIVE",
        cancelPolicy: null,
        ...overrides,
      },
      customer: { id: "cust_1", email: "ada@example.com" },
      checkout: {
        id: "bill_1",
        customerId: "cust_1",
        metadata: { workspaceId: "ws_1" },
      },
      payment: { id: "pay_1", createdAt: "2026-11-20T10:00:00Z" },
    },
  }
}

describe("billing events", () => {
  it("reads a subscription event and the workspace it was bought for", () => {
    const parsed = parseBillingEvent(event("subscription.completed"))
    expect(parsed?.event).toBe("subscription.completed")
    expect(eventWorkspaceId(parsed as SubscriptionEvent)).toBe("ws_1")
  })

  it("keeps other events by id only, and rejects what isn't an event", () => {
    expect(
      parseBillingEvent({ id: "log_2", event: "payout.completed", data: {} })
    ).toEqual({ id: "log_2", event: "payout.completed", data: null })
    expect(parseBillingEvent({ hello: "world" })).toBeNull()
  })

  it("activates the plan for a month after the payment, plus grace", () => {
    const parsed = parseBillingEvent(
      event("subscription.renewed")
    ) as SubscriptionEvent
    expect(billingChange(parsed, now)).toEqual({
      kind: "activate",
      customerId: "cust_1",
      checkoutId: "bill_1",
      subscriptionId: "subs_1",
      paidThrough: new Date("2026-12-24T10:00:00Z"),
    })
  })

  it("ends the plan now, or at the end of the paid month", () => {
    const now_ = parseBillingEvent(
      event("subscription.cancelled", { cancelPolicy: "NOW" })
    ) as SubscriptionEvent
    const later = parseBillingEvent(
      event("subscription.cancelled", { cancelPolicy: "NEXT_CYCLE" })
    ) as SubscriptionEvent
    expect(billingChange(now_, now)).toEqual({
      kind: "cancel",
      at: now,
      immediately: true,
    })
    expect(billingChange(later, now)).toMatchObject({ immediately: false })
  })
})

describe("months", () => {
  it("land on the same day, or the last day of a shorter month", () => {
    expect(addMonth(new Date("2026-01-31T08:00:00Z"))).toEqual(
      new Date("2026-02-28T08:00:00Z")
    )
    expect(addMonth(new Date("2026-12-15T00:00:00Z"))).toEqual(
      new Date("2027-01-15T00:00:00Z")
    )
    expect(paidThrough(new Date("2026-03-01T00:00:00Z"))).toEqual(
      new Date("2026-04-05T00:00:00Z")
    )
  })
})
