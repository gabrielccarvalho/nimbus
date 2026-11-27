"use client"

import { GoogleLogoIcon, TwitchLogoIcon } from "@phosphor-icons/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useMessages } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

import { authClient } from "./auth-client"
import { auth, authErrorMessage } from "./messages"

type Mode = "signin" | "signup"

export function safeNext(next: string | undefined) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/"
}

export function AuthHeading({ lede }: { lede: string }) {
  const t = useMessages(auth).headline
  return (
    <div className="grid gap-3">
      <h1 className="text-[44px] leading-[1.04] font-semibold tracking-[-0.045em] text-balance max-sm:text-[36px]">
        {t.lead} <span className="text-gradient">{t.accent}</span>
      </h1>
      <p className="text-base text-muted-foreground">{lede}</p>
    </div>
  )
}

function ModeSwitch({ mode, next }: { mode: Mode; next: string }) {
  const t = useMessages(auth).form
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`
  const items = [
    { mode: "signin" as const, href: `/login${query}` },
    { mode: "signup" as const, href: `/signup${query}` },
  ]
  return (
    <nav
      aria-label={t.modeSwitch}
      className="inline-flex gap-0.5 justify-self-start rounded-full bg-glass p-[3px] inset-ring-1 inset-ring-hair"
    >
      {items.map((item) => (
        <Link
          key={item.mode}
          href={item.href as Route}
          aria-current={item.mode === mode ? "page" : undefined}
          className={cn(
            "rounded-full px-3.5 py-2 text-[13.5px] leading-[1.1] font-medium text-muted-foreground transition-colors hover:text-foreground",
            item.mode === mode &&
              "bg-white/14 text-foreground inset-ring-1 inset-ring-white/10"
          )}
        >
          {t[item.mode].title}
        </Link>
      ))}
    </nav>
  )
}

export function AuthForm({
  mode,
  next: rawNext,
  providers,
}: {
  mode: Mode
  next?: string
  providers: { google: boolean; twitch: boolean }
}) {
  const router = useRouter()
  const next = safeNext(rawNext)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const messages = useMessages(auth)
  const t = messages.form
  const copy = t[mode]

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get("email") ?? "")
    const password = String(data.get("password") ?? "")
    startTransition(async () => {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: String(data.get("name") ?? ""),
              email,
              password,
            })
          : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(authErrorMessage(messages.errors, result.error))
        return
      }
      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        router.push("/login/two-factor")
        return
      }
      router.replace(next as Route)
      router.refresh()
    })
  }

  const social = (provider: "google" | "twitch") =>
    startTransition(async () => {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: next,
      })
      if (result.error)
        setError(authErrorMessage(messages.errors, result.error, "failed"))
    })

  const anySocial = providers.google || providers.twitch

  return (
    <>
      <AuthHeading lede={copy.lede} />
      <ModeSwitch mode={mode} next={next} />
      {anySocial && (
        <>
          <div className="grid gap-2.5">
            {providers.google && (
              <Button
                size="lg"
                className="w-full text-[15px]"
                disabled={pending}
                onClick={() => social("google")}
              >
                <GoogleLogoIcon weight="bold" aria-hidden />
                {t.continueWith("Google")}
              </Button>
            )}
            {providers.twitch && (
              <Button
                size="lg"
                className="w-full text-[15px]"
                disabled={pending}
                onClick={() => social("twitch")}
              >
                <TwitchLogoIcon weight="bold" aria-hidden />
                {t.continueWith("Twitch")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-tertiary">
            <span className="h-px flex-1 bg-hair" />
            {t.orEmail}
            <span className="h-px flex-1 bg-hair" />
          </div>
        </>
      )}
      <form aria-label={copy.form} onSubmit={submit} className="grid gap-4">
        <FieldGroup className="gap-4">
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="name">{t.name}</FieldLabel>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder={t.namePlaceholder}
                required
                maxLength={80}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="email">{t.email}</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              required
            />
          </Field>
          <Field data-invalid={error ? true : undefined}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="password">{t.password}</FieldLabel>
              {mode === "signin" && (
                <Link
                  href="/forgot-password"
                  className="text-[13px] text-muted-foreground hover:text-foreground"
                >
                  {t.forgot}
                </Link>
              )}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder={
                mode === "signup"
                  ? t.newPasswordPlaceholder
                  : t.passwordPlaceholder
              }
              minLength={mode === "signup" ? 10 : undefined}
              required
              aria-invalid={error ? true : undefined}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-1 w-full"
          disabled={pending}
        >
          {pending ? t.pending : copy.cta}
        </Button>
      </form>
      <p className="text-[12.5px] text-tertiary">{t.privacy}</p>
    </>
  )
}
