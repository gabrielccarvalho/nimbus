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
  renameWorkspaceAction,
  revokeSessionAction,
  saveAnthropicKeyAction,
} from "@/features/accounts/actions"
import type { ChannelRow, SecuritySettings } from "@/features/accounts/queries"
import { YOUTUBE_SCOPES } from "@/features/accounts/schema"
import { formatRelativeDay } from "@/lib/format"

import { SettingRow, SettingsSection, SettingsSectionHeader } from "./section"

type Outcome =
  | { error?: { message?: string } | null }
  | { ok: boolean; error?: { message: string } }

function failed(result: Outcome) {
  if ("ok" in result)
    return result.ok ? null : (result.error?.message ?? "That didn't work")
  return result.error ? (result.error.message ?? "That didn't work") : null
}

function useAction() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const run = (
    action: () => Promise<Outcome>,
    success?: string,
    after?: () => void
  ) =>
    startTransition(async () => {
      const message = failed(await action())
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
        Save
      </Button>
    </form>
  )
}

export function ProfileName({ name }: { name: string }) {
  return (
    <NameForm
      label="Name"
      initial={name}
      success="Name saved"
      save={(value) => authClient.updateUser({ name: value })}
    />
  )
}

export function WorkspaceName({ name }: { name: string }) {
  return (
    <NameForm
      label="Workspace name"
      initial={name}
      success="Workspace renamed"
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
              "Password changed. Other sessions were signed out.",
              () => onOpenChange(false)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Other sessions are signed out.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="current-password">
                Current password
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
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
              <FieldDescription>At least 10 characters.</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={pending}>
              Change password
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
                "Two-step verification is on",
                () => close(false)
              )
            }}
          >
            <DialogHeader>
              <DialogTitle>Scan with your authenticator</DialogTitle>
              <DialogDescription>
                Then enter the 6-digit code it shows. Keep the backup codes
                somewhere safe; each works once.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-start gap-5">
              <div
                role="img"
                aria-label="QR code for your authenticator app"
                className="size-40 shrink-0 rounded-xl bg-white p-2 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }}
              />
              <div className="grid min-w-0 flex-1 gap-2 text-[13px] text-tertiary">
                <span>Or enter this key</span>
                <code className="font-mono text-xs break-all text-foreground">
                  {secret}
                </code>
                <span className="pt-2">Backup codes</span>
                <ul className="grid grid-cols-2 gap-x-3 font-mono text-xs text-foreground">
                  {setup.backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </div>
            </div>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="totp">Code</FieldLabel>
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
                Turn on
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
                  "Two-step verification is off",
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
                {enabled
                  ? "Turn off two-step verification?"
                  : "Turn on two-step verification"}
              </DialogTitle>
              <DialogDescription>Confirm with your password.</DialogDescription>
            </DialogHeader>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="tfa-password">Password</FieldLabel>
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
                {enabled ? "Turn off" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ApiKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pending, error, run } = useAction()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            const key = String(new FormData(event.currentTarget).get("key"))
            run(
              () => saveAnthropicKeyAction(key),
              "Claude API key saved",
              () => onOpenChange(false)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Claude API key</DialogTitle>
            <DialogDescription>
              Stored encrypted. Only the last four characters are shown again.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="anthropic-key">Key</FieldLabel>
            <Input
              id="anthropic-key"
              name="key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              required
              className="font-mono"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={pending}>
              Save key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SecuritySettingsView({ data }: { data: SecuritySettings }) {
  const [dialog, setDialog] = React.useState<"password" | "2fa" | null>(null)
  return (
    <>
      <SettingsSection className="gap-1">
        <SettingsSectionHeader title="Sign-in & security" />
        {data.hasPassword && (
          <SettingRow
            title="Password"
            description={
              data.passwordChangedAt
                ? `Last changed ${formatRelativeDay(data.passwordChangedAt).toLowerCase()}`
                : undefined
            }
          >
            <Button size="sm" onClick={() => setDialog("password")}>
              Change
            </Button>
          </SettingRow>
        )}
        {data.hasPassword && (
          <SettingRow
            title="Two-step verification"
            description="A code from your authenticator app at sign-in"
          >
            <Switch
              aria-label="Two-step verification"
              checked={data.twoFactorEnabled}
              onCheckedChange={() => setDialog("2fa")}
            />
          </SettingRow>
        )}
        {!data.hasPassword && (
          <SettingRow
            title="Password"
            description="You sign in with a connected account."
          />
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

export function ClaudeKeyRow({ keyHint }: { keyHint: string | null }) {
  const [open, setOpen] = React.useState(false)
  const { pending, run } = useAction()
  return (
    <SettingRow
      title="Claude API key"
      description="Used by the Claude highlight selector. Stored encrypted."
    >
      {keyHint && (
        <span className="font-mono text-[13px] text-muted-foreground">
          {keyHint}
        </span>
      )}
      <Button size="sm" onClick={() => setOpen(true)}>
        {keyHint ? "Replace" : "Add key"}
      </Button>
      {keyHint && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(() => removeAnthropicKeyAction(), "Claude API key removed")
          }
        >
          Remove
        </Button>
      )}
      <ApiKeyDialog open={open} onOpenChange={setOpen} />
    </SettingRow>
  )
}

export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const { pending, error, run } = useAction()
  return (
    <SettingsSection className="flex flex-wrap items-center gap-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-semibold">Delete account</b>
        <span className="text-[13px] text-tertiary">
          Removes every project, clip and export. This can&apos;t be undone.
        </span>
      </div>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Delete account…
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
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                Every project, clip and render in your workspace is removed from
                disk.
              </DialogDescription>
            </DialogHeader>
            {hasPassword && (
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="delete-password">Password</FieldLabel>
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
                Delete everything
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

function SessionList({ sessions }: { sessions: SecuritySettings["sessions"] }) {
  const { pending, run } = useAction()
  const others = sessions.filter((s) => !s.current).length

  return (
    <SettingsSection aria-labelledby="sessions-title">
      <SettingsSectionHeader
        id="sessions-title"
        title="Sessions"
        description="Everywhere you're signed in."
      >
        {others > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => authClient.revokeOtherSessions(),
                "Signed out everywhere else"
              )
            }
          >
            Sign out all others
          </Button>
        )}
      </SettingsSectionHeader>
      <ul className="grid gap-2">
        {sessions.map((s) => {
          const Icon = s.device?.mobile ? DeviceMobileIcon : DesktopIcon
          const name = s.device
            ? `${s.device.browser} on ${s.device.os}`
            : "Unknown device"
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
                    <StatusPill tone="mint">This device</StatusPill>
                  )}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {[
                    s.ipAddress,
                    s.current
                      ? "Active now"
                      : `Last active ${formatRelativeDay(s.updatedAt).toLowerCase()}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  disabled={pending}
                  aria-label={`Sign out ${name}`}
                  onClick={() =>
                    run(() => revokeSessionAction(s.id), `Signed out ${name}`)
                  }
                >
                  Sign out
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
  const { pending, run } = useAction()
  const connect = (channel: ChannelRow) =>
    run(() =>
      authClient.linkSocial({
        provider: channel.providerId!,
        callbackURL: "/settings/channels",
        scopes: channel.id === "youtube" ? YOUTUBE_SCOPES : undefined,
      })
    )
  const disconnect = (channel: ChannelRow) =>
    run(
      () => authClient.unlinkAccount({ accountId: channel.accountId! }),
      `${channel.name} disconnected`
    )

  return (
    <SettingsSection className="gap-1">
      <SettingsSectionHeader
        title="Connected channels"
        description="Import VODs without pasting links, and publish approved clips to your channels."
      />
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
                  {channel.channelError}
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
                {channel.providerId ? "Not set up" : "Soon"}
              </StatusPill>
            ) : channel.connectedAt || channel.needsReconnect ? (
              <>
                {channel.needsReconnect ? (
                  <>
                    <StatusPill tone="amber">Needs reconnect</StatusPill>
                    <Button
                      size="sm"
                      disabled={pending}
                      aria-label={`Reconnect ${channel.name}`}
                      onClick={() => connect(channel)}
                    >
                      Reconnect
                    </Button>
                  </>
                ) : (
                  <StatusPill tone="mint">Connected</StatusPill>
                )}
                {channel.connectedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Disconnect ${channel.name}`}
                    onClick={() => disconnect(channel)}
                  >
                    Disconnect
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                aria-label={`Connect ${channel.name}`}
                onClick={() => connect(channel)}
              >
                Connect
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsSection>
  )
}
