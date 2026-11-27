"use server"

import { getDb } from "@/lib/db"
import { runAction } from "@/lib/server-action"

import { requireActor } from "../accounts/session"
import { billingPortalUrl, startCreatorCheckout } from "./service"

export async function startCreatorCheckoutAction() {
  return runAction(
    "startCreatorCheckout",
    async () => startCreatorCheckout(getDb(), await requireActor()),
    []
  )
}

export async function billingPortalAction() {
  return runAction(
    "billingPortal",
    async () => billingPortalUrl((await requireActor()).workspace),
    []
  )
}
