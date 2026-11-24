import type { Metadata } from "next"

import { TwoFactorForm } from "@/components/auth/recovery-forms"

export const metadata: Metadata = { title: "Two-step verification" }

export default function TwoFactorPage() {
  return <TwoFactorForm />
}
