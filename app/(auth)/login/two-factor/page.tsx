import type { Metadata } from "next"

import { auth } from "@/components/auth/messages"
import { TwoFactorForm } from "@/components/auth/recovery-forms"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(auth)).twoFactor.title }
}

export default function TwoFactorPage() {
  return <TwoFactorForm />
}
