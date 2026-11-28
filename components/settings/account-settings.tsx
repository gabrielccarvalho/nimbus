"use client"

import { DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"
import { renderSVG } from "uqr"

import { authClient } from "@/components/auth/auth-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { StatusPill } from "@/components/ui/status-pill"
import { Switch } from "@/components/ui/switch"
import { ChannelIcon } from "@/components/channels/channel-icon"
import {
  removeAnthropicKeyAction,
  removeGroqKeyAction,
  renameWorkspaceAction,
  revokeSessionAction,
  saveAnthropicKeyAction,
  saveGroqKeyAction,
} from "@/features/accounts/actions"
import type { ChannelRow, SecuritySettings } from "@/features/accounts/queries"
import { YOUTUBE_SCOPES } from "@/features/accounts/schema"
import { formatRelativeDay } from "@/lib/format"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"
import { common } from "@/lib/i18n/common"

import { settings } from "./messages"
import { SettingRow, SettingsSection, SettingsSectionHeader } from "./section"

type Outcome =
  | { error?: { message?: string } | null }
  | { ok: boolean; error?: { message: string } }

function failed(result: Outcome, fallback: string) {
  if ("ok" in result)
    return result.ok ? null : (result.error?.message ?? fallback)
  return result.error ? (result.error.message ?? fallback) : null
}

function useAction() {
  const router = useRouter()
  const fallback = useMessages(common).failed
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const run = (
    action: () => Promise<Outcome>,
    success?: string,
    after?: () => void
  ) =>
    startTransition(async () => {
      const message = failed(await action(), fallback)
      setError(message)
      if (message) return
      if (success) toast.success(success)
      after?.()
      router.refresh()
    })
  return { pending, error, setError, run }
}

export function NameForm({
  label,
  initial,
  save,
  success,
}: {
  label: string
  initial: string
  save: (name: string) => Promise<Outcome>
  success: string
}) {
  const id = React.useId()
  const c = useMessages(common)
  const [name, setName] = React.useState(initial)
  const { pending, error, run } = useAction()
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => save(name), success)
      }}
    >
      <Field
        className="min-w-0 flex-[1_1_240px]"
        data-invalid={error ? true : undefined}
      >
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" disabled={pending || name.trim() === initial}>
        {c.save}
      </Button>
    </form>
  )
}

export function ProfileName({ name }: { name: string }) {
  const t = useMessages(settings).profile
  return (
    <NameForm
      label={t.name}
      initial={name}
      success={t.nameSaved}
      save={(value) => authClient.updateUser({ name: value })}
    />
  )
}

export function WorkspaceName({ name }: { name: string }) {
  const t = useMessages(settings).workspace
  return (
    <NameForm
      label={t.name}
      initial={name}
      success={t.renamed}
      save={(value) => renameWorkspaceAction(value)}
    />
  )
}

function PasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useMessages(settings).security
  const { pending, error, run } = useAction()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            run(
              () =>
                authClient.changePassword({
                  currentPassword: String(data.get("current")),
                  newPassword: String(data.get("next")),
                  revokeOtherSessions: true,
                }),
              t.passwordChanged,
              () => onOpenChange(false)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{t.changePassword}</DialogTitle>
            <DialogDescription>{t.changePasswordHint}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="current-password">
                {t.currentPassword}
              </FieldLabel>
              <Input
                id="current-password"
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="new-password">{t.newPassword}</FieldLabel>
              <Input
                id="new-password"
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
              <FieldDescription>{t.newPasswordHint}</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={pending}>
              {t.changePassword}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TwoFactorDialog({
  enabled,
  open,
  onOpenChange,
}: {
  enabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { twoFactor: t, security } = useMessages(settings)
  const c = useMessages(common)
  const { pending, error, setError, run } = useAction()
  const [setup, setSetup] = React.useState<{
    uri: string
    backupCodes: string[]
  } | null>(null)

  const close = (next: boolean) => {
    if (!next) {
      setSetup(null)
      setError(null)
    }
    onOpenChange(next)
  }

  const secret = setup ? new URL(setup.uri).searchParams.get("secret") : null

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {setup ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              const code = String(
                new FormData(event.currentTarget).get("code")
              ).replace(/\s/g, "")
              run(
                () => authClient.twoFactor.verifyTotp({ code }),
                t.on,
                () => close(false)
              )
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.scanTitle}</DialogTitle>
              <DialogDescription>{t.scanDescription}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-start gap-5">
              <div
                role="img"
                aria-label={t.qrCode}
                className="size-40 shrink-0 rounded-xl bg-white p-2 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }}
              />
              <div className="grid min-w-0 flex-1 gap-2 text-[13px] text-tertiary">
                <span>{t.secret}</span>
                <code className="font-mono text-xs break-all text-foreground">
                  {secret}
                </code>
                <span className="pt-2">{t.backupCodes}</span>
                <ul className="grid grid-cols-2 gap-x-3 font-mono text-xs text-foreground">
                  {setup.backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </div>
            </div>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="totp">{t.code}</FieldLabel>
              <Input
                id="totp"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="font-mono tracking-[0.2em]"
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="submit" variant="primary" disabled={pending}>
                {t.turnOn}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              const password = String(
                new FormData(event.currentTarget).get("password")
              )
              if (enabled) {
                run(
                  () => authClient.twoFactor.disable({ password }),
                  t.off,
                  () => close(false)
                )
                return
              }
              run(async () => {
                const result = await authClient.twoFactor.enable({ password })
                if (result.data?.method === "totp") {
                  setSetup({
                    uri: result.data.totpURI,
                    backupCodes: result.data.backupCodes,
                  })
                }
                return result
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {enabled ? t.turnOffTitle : t.turnOnTitle}
              </DialogTitle>
              <DialogDescription>{t.confirm}</DialogDescription>
            </DialogHeader>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="tfa-password">
                {security.password}
              </FieldLabel>
              <Input
                id="tfa-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <DialogFooter>
              <Button
                type="submit"
                variant={enabled ? "destructive" : "primary"}
                disabled={pending}
              >
                {enabled ? t.turnOff : c.continue}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

const API_KEYS = {
  claude: {
    messages: "apiKey",
    placeholder: "sk-ant-…",
    save: saveAnthropicKeyAction,
    remove: removeAnthropicKeyAction,
  },
  groq: {
    messages: "groqKey",
    placeholder: "gsk_…",
    save: saveGroqKeyAction,
    remove: removeGroqKeyAction,
  },
} as const

type ApiKeyProvider = keyof typeof API_KEYS

function ApiKeyDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: ApiKeyProvider
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const config = API_KEYS[provider]
  const t = useMessages(settings)[config.messages]
  const { pending, error, run } = useAction()
  const id = `${provider}-key`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            const key = String(new FormData(event.currentTarget).get("key"))
            run(
              () => config.save(key),
              t.saved,
              () => onOpenChange(false)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={id}>{t.key}</FieldLabel>
            <Input
              id={id}
              name="key"
              type="password"
              autoComplete="off"
              placeholder={config.placeholder}
              required
              className="font-mono"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={pending}>
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SecuritySettingsView({ data }: { data: SecuritySettings }) {
  const locale = useLocale()
  const { nav, security: t, twoFactor } = useMessages(settings)
  const [dialog, setDialog] = React.useState<"password" | "2fa" | null>(null)
  return (
    <>
      <SettingsSection className="gap-1">
        <SettingsSectionHeader title={nav.security} />
        {data.hasPassword && (
          <SettingRow
            title={t.password}
            description={
              data.passwordChangedAt
                ? t.lastChanged(
                    formatRelativeDay(
                      data.passwordChangedAt,
                      undefined,
                      locale
                    ).toLowerCase()
                  )
                : undefined
            }
          >
            <Button size="sm" onClick={() => setDialog("password")}>
              {t.change}
            </Button>
          </SettingRow>
        )}
        {data.hasPassword && (
          <SettingRow title={twoFactor.title} description={twoFactor.hint}>
            <Switch
              aria-label={twoFactor.title}
              checked={data.twoFactorEnabled}
              onCheckedChange={() => setDialog("2fa")}
            />
          </SettingRow>
        )}
        {!data.hasPassword && (
          <SettingRow title={t.password} description={t.connectedAccount} />
        )}
        <PasswordDialog
          open={dialog === "password"}
          onOpenChange={(o) => setDialog(o ? "password" : null)}
        />
        <TwoFactorDialog
          enabled={data.twoFactorEnabled}
          open={dialog === "2fa"}
          onOpenChange={(o) => setDialog(o ? "2fa" : null)}
        />
      </SettingsSection>
      <SessionList sessions={data.sessions} />
    </>
  )
}

export function ApiKeyRow({
  provider,
  keyHint,
}: {
  provider: ApiKeyProvider
  keyHint: string | null
}) {
  const config = API_KEYS[provider]
  const t = useMessages(settings)[config.messages]
  const c = useMessages(common)
  const [open, setOpen] = React.useState(false)
  const { pending, run } = useAction()
  return (
    <SettingRow title={t.title} description={t.hint}>
      {keyHint && (
        <span className="font-mono text-[13px] text-muted-foreground">
          {keyHint}
        </span>
      )}
      <Button size="sm" onClick={() => setOpen(true)}>
        {keyHint ? t.replace : t.add}
      </Button>
      {keyHint && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => config.remove(), t.removed)}
        >
          {c.remove}
        </Button>
      )}
      <ApiKeyDialog provider={provider} open={open} onOpenChange={setOpen} />
    </SettingRow>
  )
}

export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter()
  const { deleteAccount: t, security } = useMessages(settings)
  const [open, setOpen] = React.useState(false)
  const { pending, error, run } = useAction()
  return (
    <SettingsSection className="flex flex-wrap items-center gap-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-semibold">{t.title}</b>
        <span className="text-[13px] text-tertiary">{t.hint}</span>
      </div>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        {t.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              const password = String(
                new FormData(event.currentTarget).get("password") ?? ""
              )
              run(
                () => authClient.deleteUser(hasPassword ? { password } : {}),
                undefined,
                () => router.replace("/signup")
              )
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.confirmTitle}</DialogTitle>
              <DialogDescription>{t.confirmDescription}</DialogDescription>
            </DialogHeader>
            {hasPassword && (
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="delete-password">
                  {security.password}
                </FieldLabel>
                <Input
                  id="delete-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
            )}
            {!hasPassword && error && <FieldError>{error}</FieldError>}
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t.confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

function SessionList({ sessions }: { sessions: SecuritySettings["sessions"] }) {
  const locale = useLocale()
  const t = useMessages(settings).sessions
  const c = useMessages(common)
  const { pending, run } = useAction()
  const others = sessions.filter((s) => !s.current).length

  return (
    <SettingsSection aria-labelledby="sessions-title">
      <SettingsSectionHeader
        id="sessions-title"
        title={t.title}
        description={t.description}
      >
        {others > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(() => authClient.revokeOtherSessions(), t.signedOutOthers)
            }
          >
            {t.signOutOthers}
          </Button>
        )}
      </SettingsSectionHeader>
      <ul className="grid gap-2">
        {sessions.map((s) => {
          const Icon = s.device?.mobile ? DeviceMobileIcon : DesktopIcon
          const name = s.device
            ? t.device(s.device.browser, s.device.os)
            : t.unknownDevice
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3.5 rounded-[14px] bg-graphite-2 px-4 py-3"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-glass-2 text-muted-foreground inset-ring-1 inset-ring-white/8">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {name}
                  {s.current && (
                    <StatusPill tone="mint">{t.thisDevice}</StatusPill>
                  )}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {[
                    s.ipAddress,
                    s.current
                      ? t.activeNow
                      : t.lastActive(
                          formatRelativeDay(
                            s.updatedAt,
                            undefined,
                            locale
                          ).toLowerCase()
                        ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  disabled={pending}
                  aria-label={t.signOut(name)}
                  onClick={() =>
                    run(() => revokeSessionAction(s.id), t.signedOut(name))
                  }
                >
                  {c.signOut}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}

export function ChannelList({ channels }: { channels: ChannelRow[] }) {
  const locale = useLocale()
  const { nav, channels: t, soon } = useMessages(settings)
  const { pending, error, run } = useAction()
  const connect = (channel: ChannelRow) =>
    run(() =>
      authClient.linkSocial({
        provider: channel.providerId!,
        callbackURL: "/settings/channels",
        scopes: channel.id === "youtube" ? YOUTUBE_SCOPES : undefined,
      })
    )
  const disconnect = (channel: ChannelRow) =>
    run(async () => {
      const result = await authClient.unlinkAccount({
        accountId: channel.accountId!,
      })
      return result.error?.code === "SESSION_NOT_FRESH"
        ? { error: { message: t.staleSession(channel.name) } }
        : result
    }, t.disconnected(channel.name))

  return (
    <SettingsSection className="gap-1">
      <SettingsSectionHeader title={nav.channels} description={t.description} />
      <ul className="grid gap-2 pt-3 sm:grid-cols-2">
        {channels.map((channel) => (
          <li
            key={channel.id}
            className="flex items-center gap-3.5 rounded-[14px] bg-graphite-2 p-3.5"
          >
            <ChannelIcon provider={channel.id} />
            <span className="grid min-w-0 flex-1">
              <span className="font-medium">{channel.name}</span>
              {channel.channelError && (
                <span role="alert" className="text-[13px] text-amber">
                  {translateError(channel.channelError, locale)}
                </span>
              )}
              {channel.channelTitle && (
                <span className="truncate text-[13px] text-muted-foreground">
                  {channel.channelTitle}
                </span>
              )}
            </span>
            {!channel.configured ? (
              <StatusPill tone="neutral">
                {channel.providerId ? t.notSetUp : soon}
              </StatusPill>
            ) : channel.connectedAt || channel.needsReconnect ? (
              <>
                {channel.needsReconnect ? (
                  <>
                    <StatusPill tone="amber">{t.needsReconnect}</StatusPill>
                    <Button
                      size="sm"
                      disabled={pending}
                      aria-label={t.reconnectChannel(channel.name)}
                      onClick={() => connect(channel)}
                    >
                      {t.reconnect}
                    </Button>
                  </>
                ) : (
                  <StatusPill tone="mint">{t.connected}</StatusPill>
                )}
                {channel.connectedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={t.disconnectChannel(channel.name)}
                    onClick={() => disconnect(channel)}
                  >
                    {t.disconnect}
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                aria-label={t.connectChannel(channel.name)}
                onClick={() => connect(channel)}
              >
                {t.connect}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <FieldError className="pt-2">{error}</FieldError>}
    </SettingsSection>
  )
}
