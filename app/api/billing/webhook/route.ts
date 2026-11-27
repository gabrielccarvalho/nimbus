import { receiveBillingEvent } from "@/features/billing/service"
import { assertWebhookSecret } from "@/features/billing/webhook"
import { getDb } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { errorResponse } from "@/lib/http/responses"

export async function POST(request: Request) {
  try {
    assertWebhookSecret(request)
    const body: unknown = await request.json().catch(() => {
      throw new AppError("VALIDATION", "Invalid billing event")
    })
    await receiveBillingEvent(getDb(), body)
    return new Response(null, { status: 204 })
  } catch (error) {
    return errorResponse(error, { route: "billing-webhook" })
  }
}
