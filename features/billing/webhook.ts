import "server-only"

import { timingSafeEqual } from "node:crypto"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

function same(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// AbacatePay sends the secret both ways; it proves the call is theirs. The
// X-Webhook-Signature header is an HMAC with a key published in their docs, so
// it only proves integrity, which TLS already gives.
export function assertWebhookSecret(request: Request) {
  const expected = getEnv().ABACATEPAY_WEBHOOK_SECRET
  if (!expected) throw new AppError("NOT_FOUND", "Not found")
  const given =
    request.headers.get("x-webhook-secret") ??
    new URL(request.url).searchParams.get("webhookSecret")
  if (!given || !same(given, expected)) {
    throw new AppError("UNAUTHORIZED", "Invalid webhook secret")
  }
}
