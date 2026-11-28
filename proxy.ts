import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

import { isLocale, LOCALE_COOKIE, matchLocale } from "@/lib/i18n/config"
import { translateError } from "@/lib/i18n/errors"

const LANDING_PATH = "/welcome"

const PUBLIC_PATHS = [
  LANDING_PATH,
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]

// Optimistic: the cookie's presence only. Pages, actions and routes check the session.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const signedIn = Boolean(getSessionCookie(request))
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
  if (signedIn || isPublic) return NextResponse.next()
  if (pathname.startsWith("/api/")) {
    const chosen = request.cookies.get(LOCALE_COOKIE)?.value
    const locale = isLocale(chosen)
      ? chosen
      : matchLocale(request.headers.get("accept-language"))
    const message = translateError("Sign in to continue", locale)
    return Response.json(
      { error: { code: "UNAUTHORIZED", message } },
      { status: 401 }
    )
  }
  // The front door: a signed-out visitor gets the landing page at "/" itself.
  if (pathname === "/") {
    return NextResponse.rewrite(new URL(LANDING_PATH, request.url))
  }
  const login = new URL("/login", request.url)
  login.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(login)
}

// Uploads skip the proxy: it buffers request bodies and truncates them past
// proxyClientMaxBodySize. The route handler checks the signed upload token.
// The billing webhook has no session; its route checks the shared secret.
// Link previews are fetched by crawlers that are never signed in.
export const config = {
  matcher: [
    "/((?!opengraph-image|api/auth|api/billing/webhook|api/fonts|api/uploads|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
}
