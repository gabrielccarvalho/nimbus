import type { Metadata } from "next"

import { AuthForm } from "@/components/auth/auth-form"
import { auth } from "@/components/auth/messages"
import { enabledSocialProviders } from "@/features/accounts/auth"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(auth)).form.signup.title }
}

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
