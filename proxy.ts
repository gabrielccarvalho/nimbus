import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = [
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
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in to continue" } },
      { status: 401 }
    )
  }
  const login = new URL("/login", request.url)
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(login)
}

// Uploads skip the proxy: it buffers request bodies and truncates them past
// proxyClientMaxBodySize. The route handler checks the signed upload token.
export const config = {
  matcher: [
    "/((?!api/auth|api/fonts|api/uploads|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
}
