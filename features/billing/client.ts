import "server-only"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

export type BillingCustomer = { email: string; name: string }

export type SubscriptionCheckout = {
  productId: string
  customerId: string
  workspaceId: string
  completionUrl: string
  returnUrl: string
}

export interface BillingClient {
  createCustomer(customer: BillingCustomer): Promise<string>
  createSubscriptionCheckout(
    input: SubscriptionCheckout
  ): Promise<{ id: string; url: string }>
  portalUrl(input: { customerId: string; checkoutId: string }): Promise<string>
}

const API = "https://api.abacatepay.com/v2"

type Envelope<T> = { data: T | null; success: boolean; error: string | null }

class AbacatePayHttp implements BillingClient {
  constructor(private readonly key: string) {}

  private async post<T>(path: string, body: object): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (cause) {
      throw new AppError("EXTERNAL", "AbacatePay didn't answer", { cause })
    }
    const payload = (await response
      .json()
      .catch(() => null)) as Envelope<T> | null
    if (!response.ok || !payload?.success || !payload.data) {
      throw new AppError(
        "EXTERNAL",
        `AbacatePay returned ${payload?.error ?? response.status}`
      )
    }
    return payload.data
  }

  async createCustomer(customer: BillingCustomer) {
    const data = await this.post<{ id: string }>("/customers/create", customer)
    return data.id
  }

  async createSubscriptionCheckout(input: SubscriptionCheckout) {
    return this.post<{ id: string; url: string }>("/subscriptions/create", {
      items: [{ id: input.productId, quantity: 1 }],
      methods: ["CARD"],
      customerId: input.customerId,
      externalId: `${input.workspaceId}:${Date.now()}`,
      metadata: { workspaceId: input.workspaceId },
      completionUrl: input.completionUrl,
      returnUrl: input.returnUrl,
    })
  }

  async portalUrl(input: { customerId: string; checkoutId: string }) {
    const data = await this.post<{ url: string }>(
      "/customer-portal/create",
      input
    )
    return data.url
  }
}

export class BillingFake implements BillingClient {
  readonly customers: BillingCustomer[] = []
  readonly checkouts: SubscriptionCheckout[] = []

  async createCustomer(customer: BillingCustomer) {
    this.customers.push(customer)
    return `cust_fake_${this.customers.length}`
  }

  async createSubscriptionCheckout(input: SubscriptionCheckout) {
    this.checkouts.push(input)
    const id = `bill_fake_${this.checkouts.length}`
    return { id, url: `https://pay.example.com/${id}` }
  }

  async portalUrl(input: { customerId: string; checkoutId: string }) {
    return `https://portal.example.com/${input.customerId}/${input.checkoutId}`
  }
}

let fake: BillingFake | undefined

export function billingEnabled() {
  const env = getEnv()
  if (env.BILLING_CLIENT === "fake") return true
  return Boolean(env.ABACATEPAY_API_KEY && env.ABACATEPAY_CREATOR_PRODUCT_ID)
}

export function getBillingClient(): BillingClient {
  const env = getEnv()
  if (env.BILLING_CLIENT === "fake") return (fake ??= new BillingFake())
  if (!env.ABACATEPAY_API_KEY) {
    throw new AppError("DEPENDENCY_MISSING", "Billing isn't set up")
  }
  return new AbacatePayHttp(env.ABACATEPAY_API_KEY)
}

export function creatorProductId() {
  const env = getEnv()
  if (env.BILLING_CLIENT === "fake") return "prod_fake_creator"
  if (!env.ABACATEPAY_CREATOR_PRODUCT_ID) {
    throw new AppError("DEPENDENCY_MISSING", "Billing isn't set up")
  }
  return env.ABACATEPAY_CREATOR_PRODUCT_ID
}
