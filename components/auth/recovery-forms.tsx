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
import { useMessages } from "@/lib/i18n/client"

import { authClient } from "./auth-client"
import { auth, authErrorMessage, type AuthClientError } from "./messages"

function Heading({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="grid gap-3">
      <h1 className="font-heading text-[32px] leading-[1.1]">{title}</h1>
      <p className="text-base text-muted-foreground">{lede}</p>
    </div>
  )
}

function useSubmit(
  run: (data: FormData) => Promise<{ error: AuthClientError | null }>,
  onDone: () => void
) {
  const errors = useMessages(auth).errors
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await run(data)
      if (result.error) {
        setError(authErrorMessage(errors, result.error))
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
  const t = useMessages(auth).twoFactor
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
      <Heading title={t.title} lede={backup ? t.backupLede : t.codeLede} />
      <form onSubmit={submit} className="grid gap-4" aria-label={t.form}>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="code">
            {backup ? t.backupCode : t.code}
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
            {t.trust}
          </label>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? t.pending : t.verify}
        </Button>
        <Button type="button" variant="link" onClick={() => setBackup(!backup)}>
          {backup ? t.useCode : t.useBackup}
        </Button>
      </form>
    </>
  )
}

export function ForgotPasswordForm() {
  const t = useMessages(auth).forgot
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
        <Heading title={t.sentTitle} lede={t.sentLede} />
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.back}
        </Link>
      </>
    )
  }
  return (
    <>
      <Heading title={t.title} lede={t.lede} />
      <form onSubmit={submit} className="grid gap-4" aria-label={t.form}>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="email">{t.email}</FieldLabel>
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
          {pending ? t.pending : t.submit}
        </Button>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.back}
        </Link>
      </form>
    </>
  )
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const router = useRouter()
  const t = useMessages(auth).reset
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
        <Heading title={t.invalidTitle} lede={t.invalidLede} />
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.newLink}
        </Link>
      </>
    )
  }
  return (
    <>
      <Heading title={t.title} lede={t.lede} />
      <form onSubmit={submit} className="grid gap-4" aria-label={t.form}>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="password">{t.password}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <FieldDescription>{t.hint}</FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? t.pending : t.submit}
        </Button>
      </form>
    </>
  )
}
