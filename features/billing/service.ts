import "server-only"

import { and, eq, lt } from "drizzle-orm"

import { withTransaction, type Db } from "@/lib/db"
import { billingEvents, workspaces } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

import type { User, Workspace } from "../accounts/repository"
import { billingEnabled, creatorProductId, getBillingClient } from "./client"
import {
  billingChange,
  eventWorkspaceId,
  parseBillingEvent,
  type SubscriptionEvent,
} from "./schema"

export const PLAN_PATH = "/settings/workspace/plan"

export function hasActiveSubscription(
  workspace: Pick<Workspace, "plan" | "planCancelledAt">
) {
  return workspace.plan === "creator" && !workspace.planCancelledAt
}

export async function startCreatorCheckout(
  db: Db,
  viewer: { user: Pick<User, "email" | "name">; workspace: Workspace }
) {
  const { user, workspace } = viewer
  if (!billingEnabled()) {
    throw new AppError("DEPENDENCY_MISSING", "Billing isn't set up")
  }
  if (workspace.plan === "studio" || workspace.plan === "admin") {
    throw new AppError("CONFLICT", "Your plan already includes Creator")
  }
  if (hasActiveSubscription(workspace)) {
    throw new AppError("CONFLICT", "Your workspace is already on Creator")
  }
  const client = getBillingClient()
  const customerId =
    workspace.billingCustomerId ??
    (await client.createCustomer({ email: user.email, name: user.name }))
  const back = `${getEnv().BETTER_AUTH_URL}${PLAN_PATH}`
  const checkout = await client.createSubscriptionCheckout({
    productId: creatorProductId(),
    customerId,
    workspaceId: workspace.id,
    completionUrl: `${back}?checkout=done`,
    returnUrl: back,
  })
  await db
    .update(workspaces)
    .set({ billingCustomerId: customerId, billingCheckoutId: checkout.id })
    .where(eq(workspaces.id, workspace.id))
  return checkout.url
}

export async function billingPortalUrl(workspace: Workspace) {
  if (
    !billingEnabled() ||
    !workspace.billingCustomerId ||
    !workspace.billingSubscriptionId ||
    !workspace.billingCheckoutId
  ) {
    throw new AppError("CONFLICT", "This workspace has no subscription")
  }
  return getBillingClient().portalUrl({
    customerId: workspace.billingCustomerId,
    checkoutId: workspace.billingCheckoutId,
  })
}

async function eventWorkspace(db: Db, event: SubscriptionEvent) {
  const id = eventWorkspaceId(event)
  const [row] = await db
    .select()
    .from(workspaces)
    .where(
      id
        ? eq(workspaces.id, id)
        : eq(workspaces.billingSubscriptionId, event.data.subscription.id)
    )
  return row
}

// Studio and Admin are set by hand; a subscription never moves them.
const SELF_SERVE = ["free", "creator"] as const

export async function receiveBillingEvent(
  db: Db,
  body: unknown,
  now = new Date()
) {
  const event = parseBillingEvent(body)
  if (!event) throw new AppError("VALIDATION", "Invalid billing event")
  await withTransaction(db, async (tx) => {
    const [fresh] = await tx
      .insert(billingEvents)
      .values({ id: event.id, type: event.event })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id })
    if (!fresh || !event.data) return
    const subscriptionEvent = event as SubscriptionEvent
    const workspace = await eventWorkspace(tx, subscriptionEvent)
    if (!workspace) {
      logger.warn(
        { event: event.event, eventId: event.id },
        "billing event for an unknown workspace"
      )
      return
    }
    if (!(SELF_SERVE as readonly string[]).includes(workspace.plan)) return
    const change = billingChange(subscriptionEvent, now)
    if (change.kind === "activate") {
      await tx
        .update(workspaces)
        .set({
          plan: "creator",
          billingCustomerId: change.customerId ?? workspace.billingCustomerId,
          billingCheckoutId: change.checkoutId,
          billingSubscriptionId: change.subscriptionId,
          planPaidThrough: change.paidThrough,
          planCancelledAt: null,
          updatedAt: now,
        })
        .where(eq(workspaces.id, workspace.id))
      return
    }
    if (
      workspace.billingSubscriptionId !== subscriptionEvent.data.subscription.id
    ) {
      return
    }
    await tx
      .update(workspaces)
      .set(
        change.immediately
          ? {
              plan: "free",
              planPaidThrough: null,
              planCancelledAt: change.at,
              updatedAt: now,
            }
          : { planCancelledAt: change.at, updatedAt: now }
      )
      .where(eq(workspaces.id, workspace.id))
  })
}

export async function expireLapsedPlans(db: Db, now = new Date()) {
  const lapsed = await db
    .update(workspaces)
    .set({ plan: "free", planPaidThrough: null, updatedAt: now })
    .where(
      and(eq(workspaces.plan, "creator"), lt(workspaces.planPaidThrough, now))
    )
    .returning({ id: workspaces.id })
  return lapsed.length
}
