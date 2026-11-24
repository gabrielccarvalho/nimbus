import { redirect } from "next/navigation"

import { AuthGlimpse } from "@/components/auth/auth-glimpse"
import { Logo } from "@/components/app-shell/logo"
import { getSession } from "@/features/accounts/session"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (await getSession()) redirect("/")
  return (
    <div className="flex min-h-svh flex-wrap">
      <main
        id="main"
        className="flex min-w-0 flex-[1_1_520px] flex-col px-[max(24px,5vw)] pt-7 pb-8"
      >
        <Logo />
        <div className="grid flex-1 content-center justify-items-start py-12">
          <div className="grid w-[min(400px,100%)] gap-[26px]">{children}</div>
        </div>
      </main>
      <AuthGlimpse />
    </div>
  )
}
