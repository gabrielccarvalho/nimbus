import { toNextJsHandler } from "better-auth/next-js"

import { getAuth } from "@/features/accounts/auth"

export const { GET, POST } = {
  GET: (request: Request) => toNextJsHandler(getAuth()).GET(request),
  POST: (request: Request) => toNextJsHandler(getAuth()).POST(request),
}
