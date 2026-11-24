import type { Metadata } from "next"

import { AuthForm } from "@/components/auth/auth-form"
import { enabledSocialProviders } from "@/features/accounts/auth"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams
  return (
    <AuthForm
      mode="signin"
      next={typeof next === "string" ? next : undefined}
      providers={enabledSocialProviders()}
    />
  )
}
