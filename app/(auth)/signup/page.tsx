import type { Metadata } from "next"

import { AuthForm } from "@/components/auth/auth-form"
import { enabledSocialProviders } from "@/features/accounts/auth"

export const metadata: Metadata = { title: "Create account" }

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next } = await searchParams
  return (
    <AuthForm
      mode="signup"
      next={typeof next === "string" ? next : undefined}
      providers={enabledSocialProviders()}
    />
  )
}
