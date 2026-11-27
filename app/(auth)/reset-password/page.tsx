import type { Metadata } from "next"

import { auth } from "@/components/auth/messages"
import { ResetPasswordForm } from "@/components/auth/recovery-forms"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(auth)).reset.metaTitle }
}

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token } = await searchParams
  return (
    <ResetPasswordForm token={typeof token === "string" ? token : undefined} />
  )
}
