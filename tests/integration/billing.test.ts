import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import type { PlanId } from "@/features/accounts/schema"
import {
  billingPortalUrl,
  expireLapsedPlans,
  receiveBillingEvent,
  startCreatorCheckout,
} from "@/features/billing/service"
import { user, workspaces } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({ BILLING_CLIENT: "fake" })
})
afterEach(() => env.cleanup())

async function viewer(plan: PlanId = "free") {
  const id = crypto.randomUUID()
  const owner = { id, name: "Ada", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  await env.db
    .update(workspaces)
    .set({ plan })
    .where(eq(workspaces.id, workspace.id))
  return { user: owner, workspace: await reload(workspace.id) }
}

async function reload(id: string) {
  return (await accountRepository(env.db).getWorkspace(id))!
}

let eventCount = 0
function subscriptionEvent(
  type: string,
  workspaceId: string,
  {
    paidAt = "2026-11-20T10:00:00Z",
    cancelPolicy = null as string | null,
    subscriptionId = "subs_1",
  } = {}
) {
  eventCount += 1
  return {
    id: `log_${eventCount}`,
    event: type,
    apiVersion: 2,
    devMode: true,
    data: {
      subscription: {
        id: subscriptionId,
        status: type === "subscription.cancelled" ? "CANCELLED" : "ACTIVE",
        cancelPolicy,
      },
      customer: { id: "cust_fake_1" },
      checkout: {
        id: "bill_fake_1",
        customerId: "cust_fake_1",
        metadata: { workspaceId },
      },
      payment: { id: `pay_${eventCount}`, createdAt: paidAt },
    },
  }
}

describe("checkout", () => {
  it("creates the customer once and returns the payment page", async () => {
    const { user: owner, workspace } = await viewer()
    const url = await startCreatorCheckout(env.db, {
      user: owner,
      workspace,
    })
    expect(url).toBe("https://pay.example.com/bill_fake_1")
    const saved = await reload(workspace.id)
    expect(saved).toMatchObject({
      plan: "free",
      billingCustomerId: "cust_fake_1",
      billingCheckoutId: "bill_fake_1",
    })

    await startCreatorCheckout(env.db, { user: owner, workspace: saved })
    expect((await reload(workspace.id)).billingCustomerId).toBe("cust_fake_1")
  })

  it("isn't offered to a workspace that already has the plan", async () => {
    const studio = await viewer("studio")
    await expect(startCreatorCheckout(env.db, studio)).rejects.toThrow(
      "Your plan already includes Creator"
    )
    const free = await viewer()
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", free.workspace.id)
    )
    await expect(
      startCreatorCheckout(env.db, {
        user: free.user,
        workspace: await reload(free.workspace.id),
      })
    ).rejects.toThrow("Your workspace is already on Creator")
  })
})

describe("webhook events", () => {
  it("move the workspace to Creator until a month after the payment", async () => {
    const { workspace } = await viewer()
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id)
    )
    expect(await reload(workspace.id)).toMatchObject({
      plan: "creator",
      billingSubscriptionId: "subs_1",
      planPaidThrough: new Date("2026-12-24T10:00:00Z"),
      planCancelledAt: null,
    })

    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.renewed", workspace.id, {
        paidAt: "2026-12-20T10:00:00Z",
      })
    )
    expect((await reload(workspace.id)).planPaidThrough).toEqual(
      new Date("2027-01-24T10:00:00Z")
    )
  })

  it("are applied once, however often they're delivered", async () => {
    const { workspace } = await viewer()
    const completed = subscriptionEvent("subscription.completed", workspace.id)
    await receiveBillingEvent(env.db, completed)
    await env.db
      .update(workspaces)
      .set({ plan: "free" })
      .where(eq(workspaces.id, workspace.id))
    await receiveBillingEvent(env.db, completed)
    expect((await reload(workspace.id)).plan).toBe("free")
  })

  it("keep Creator to the end of the month on a cancel from the portal", async () => {
    const { workspace } = await viewer()
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id)
    )
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.cancelled", workspace.id, {
        cancelPolicy: "NEXT_CYCLE",
      })
    )
    const ending = await reload(workspace.id)
    expect(ending.plan).toBe("creator")
    expect(ending.planCancelledAt).toBeInstanceOf(Date)

    expect(
      await expireLapsedPlans(env.db, new Date("2026-12-24T09:00:00Z"))
    ).toBe(0)
    expect(
      await expireLapsedPlans(env.db, new Date("2026-12-24T11:00:00Z"))
    ).toBe(1)
    expect((await reload(workspace.id)).plan).toBe("free")
  })

  it("end Creator at once on an immediate cancel", async () => {
    const { workspace } = await viewer()
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id)
    )
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.cancelled", workspace.id, {
        cancelPolicy: "NOW",
      })
    )
    expect(await reload(workspace.id)).toMatchObject({
      plan: "free",
      planPaidThrough: null,
    })
  })

  it("ignore a cancel for an older subscription", async () => {
    const { workspace } = await viewer()
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id, {
        subscriptionId: "subs_new",
      })
    )
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.cancelled", workspace.id, {
        subscriptionId: "subs_old",
      })
    )
    expect((await reload(workspace.id)).plan).toBe("creator")
  })

  it("never touch a Studio or Admin workspace", async () => {
    const { workspace } = await viewer("admin")
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id)
    )
    expect((await reload(workspace.id)).plan).toBe("admin")
  })

  it("reject a body that isn't an event", async () => {
    await expect(receiveBillingEvent(env.db, { hello: 1 })).rejects.toThrow(
      "Invalid billing event"
    )
  })
})

describe("billing portal", () => {
  it("opens for a subscribed workspace only", async () => {
    const { workspace } = await viewer()
    await expect(billingPortalUrl(workspace)).rejects.toThrow(
      "This workspace has no subscription"
    )
    await receiveBillingEvent(
      env.db,
      subscriptionEvent("subscription.completed", workspace.id)
    )
    await expect(billingPortalUrl(await reload(workspace.id))).resolves.toBe(
      "https://portal.example.com/cust_fake_1/bill_fake_1"
    )
  })
})

describe("webhook secret", () => {
  const secret = "s".repeat(40)
  const call = (init: { header?: string; query?: string }) =>
    new Request(
      `http://localhost/api/billing/webhook${init.query ? `?webhookSecret=${init.query}` : ""}`,
      {
        method: "POST",
        headers: init.header ? { "X-Webhook-Secret": init.header } : {},
      }
    )

  it("accepts the secret in the header or the query", async () => {
    const { assertWebhookSecret } = await import("@/features/billing/webhook")
    env.cleanup()
    env = await createTestEnv({ ABACATEPAY_WEBHOOK_SECRET: secret })
    expect(() => assertWebhookSecret(call({ header: secret }))).not.toThrow()
    expect(() => assertWebhookSecret(call({ query: secret }))).not.toThrow()
    expect(() => assertWebhookSecret(call({ header: "nope" }))).toThrow(
      "Invalid webhook secret"
    )
    expect(() => assertWebhookSecret(call({}))).toThrow(
      "Invalid webhook secret"
    )
  })

  it("hides the route when no secret is configured", async () => {
    const { assertWebhookSecret } = await import("@/features/billing/webhook")
    expect(() => assertWebhookSecret(call({ header: secret }))).toThrow(
      "Not found"
    )
  })
})
