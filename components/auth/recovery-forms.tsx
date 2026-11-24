"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { authClient } from "./auth-client"

function Heading({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="grid gap-3">
      <h1 className="font-heading text-[32px] leading-[1.1]">{title}</h1>
      <p className="text-base text-muted-foreground">{lede}</p>
    </div>
  )
}

function useSubmit(
  run: (data: FormData) => Promise<{ error: { message?: string } | null }>,
  onDone: () => void
) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await run(data)
      if (result.error) {
        setError(result.error.message ?? "That didn't work. Try again.")
        return
      }
      setError(null)
      onDone()
    })
  }
  return { pending, error, submit }
}

export function TwoFactorForm() {
  const router = useRouter()
  const [backup, setBackup] = React.useState(false)
  const { pending, error, submit } = useSubmit(
    (data) => {
      const code = String(data.get("code") ?? "").replace(/\s/g, "")
      return backup
        ? authClient.twoFactor.verifyBackupCode({ code })
        : authClient.twoFactor.verifyTotp({
            code,
            trustDevice: data.get("trust") === "on",
          })
    },
    () => {
      router.replace("/")
      router.refresh()
    }
  )
  return (
    <>
      <Heading
        title="Two-step verification"
        lede={
          backup
            ? "Enter one of the backup codes you saved."
            : "Enter the 6-digit code from your authenticator app."
        }
      />
      <form
        onSubmit={submit}
        className="grid gap-4"
        aria-label="Verify sign-in"
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="code">
            {backup ? "Backup code" : "Code"}
          </FieldLabel>
          <Input
            id="code"
            name="code"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
            className="font-mono tracking-[0.2em]"
            aria-invalid={error ? true : undefined}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {!backup && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="trust" className="accent-lav" />
            Trust this device for 30 days
          </label>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Checking…" : "Verify"}
        </Button>
        <Button type="button" variant="link" onClick={() => setBackup(!backup)}>
          {backup ? "Use the authenticator code" : "Use a backup code"}
        </Button>
      </form>
    </>
  )
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false)
  const { pending, error, submit } = useSubmit(
    (data) =>
      authClient.requestPasswordReset({
        email: String(data.get("email") ?? ""),
        redirectTo: "/reset-password",
      }),
    () => setSent(true)
  )
  if (sent) {
    return (
      <>
        <Heading
          title="Check the server log"
          lede="nimbus runs on your machine and doesn't send email. If that address has an account, the reset link was written to the server log."
        />
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </Link>
      </>
    )
  }
  return (
    <>
      <Heading
        title="Reset your password"
        lede="We'll make a one-time link to set a new one."
      />
      <form
        onSubmit={submit}
        className="grid gap-4"
        aria-label="Reset password"
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "One moment…" : "Make a reset link"}
        </Button>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </Link>
      </form>
    </>
  )
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const router = useRouter()
  const { pending, error, submit } = useSubmit(
    (data) =>
      authClient.resetPassword({
        token: token ?? "",
        newPassword: String(data.get("password") ?? ""),
      }),
    () => router.replace("/login")
  )
  if (!token) {
    return (
      <>
        <Heading
          title="This link isn't valid"
          lede="Ask for a new reset link and use it within an hour."
        />
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Make a new link
        </Link>
      </>
    )
  }
  return (
    <>
      <Heading
        title="Choose a new password"
        lede="Other sessions are signed out."
      />
      <form
        onSubmit={submit}
        className="grid gap-4"
        aria-label="Set a new password"
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <FieldDescription>At least 10 characters.</FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Set password"}
        </Button>
      </form>
    </>
  )
}
