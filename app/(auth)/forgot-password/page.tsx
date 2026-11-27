import type { Metadata } from "next"

import { auth } from "@/components/auth/messages"
import { ForgotPasswordForm } from "@/components/auth/recovery-forms"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(auth)).forgot.metaTitle }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
