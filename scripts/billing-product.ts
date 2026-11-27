import "@/lib/load-env"

import { CREATOR_PRICE_CENTS } from "@/features/billing/schema"
import { getEnv } from "@/lib/env"

const key = getEnv().ABACATEPAY_API_KEY
if (!key) {
  console.error("billing:product needs ABACATEPAY_API_KEY (a v2 key)")
  process.exit(1)
}

const response = await fetch("https://api.abacatepay.com/v2/products/create", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    externalId: "nimbus-creator-monthly",
    name: "Nimbus Creator",
    price: CREATOR_PRICE_CENTS,
    currency: "BRL",
    cycle: "MONTHLY",
  }),
})
const payload = (await response.json().catch(() => null)) as {
  data?: { id?: string }
  error?: string
} | null
if (!response.ok || !payload?.data?.id) {
  console.error(`AbacatePay returned ${payload?.error ?? response.status}`)
  process.exit(1)
}
console.log(`ABACATEPAY_CREATOR_PRODUCT_ID=${payload.data.id}`)
