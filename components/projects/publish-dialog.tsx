"use client"

import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  UploadSimpleIcon,
  WarningIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { ClipStatus } from "@/features/clips/schema"
import type { AudioMix } from "@/features/music/schema"
import {
  publishClipAction,
  retryPublicationAction,
} from "@/features/publishing/actions"
import { defaultPublishInput } from "@/features/publishing/metadata"
import type { getPublishing } from "@/features/publishing/queries"
import {
  privacyStatuses,
  publishInputSchema,
  type PrivacyStatus,
} from "@/features/publishing/schema"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"
import { common } from "@/lib/i18n/common"
import { defaultLocale, type Locale } from "@/lib/i18n/config"

import { review } from "./messages/review"

export type PublishingState = Awaited<ReturnType<typeof getPublishing>>
export type PublicationState = PublishingState["publications"][string]

type PublishClip = {
  id: string
  title: string
  description: string
  status: ClipStatus
  renderAssetId: string | null
  audioMix: AudioMix | null
}

const PRIVACY: PrivacyStatus[] = ["public", "unlisted", "private"]

export function publishBlockedReason(
  clip: PublishClip,
  publishing: PublishingState,
  locale: Locale = defaultLocale
) {
  const t = review[locale].publish.blocked
  if (clip.status !== "rendered") return t.render
  if (!publishing.channel) return t.connect
  if (publishing.channel.status === "needs_reconnect") return t.reconnect
  if (publishing.publishesLeftToday === 0) return t.limit
  return null
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function PublishForm({
  clip,
  publishing,
  previous,
  onDone,
}: {
  clip: PublishClip
  publishing: PublishingState
  previous?: PublicationState["metadata"]
  onDone: () => void
}) {
  const t = useMessages(review).publish
  const privacyItems = PRIVACY.map((value) => ({
    value,
    label: t.privacy[value],
  }))
  const id = React.useId()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const initial = React.useMemo(
    () => ({
      ...defaultPublishInput(clip, publishing.defaults),
      ...previous,
    }),
    [clip, publishing.defaults, previous]
  )
  const [title, setTitle] = React.useState(initial.title)
  const [description, setDescription] = React.useState(initial.description)
  const [tags, setTags] = React.useState(initial.tags.join(", "))
  const [privacy, setPrivacy] = React.useState<PrivacyStatus>(initial.privacy)
  const [scheduled, setScheduled] = React.useState(false)
  const [publishAt, setPublishAt] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const effectivePrivacy = scheduled ? "private" : privacy

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const when = scheduled ? new Date(publishAt) : null
    if (when && (Number.isNaN(when.getTime()) || when <= new Date())) {
      setError(t.futureTime)
      return
    }
    const parsed = publishInputSchema.safeParse({
      title,
      description,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      privacy: effectivePrivacy,
      publishAt: when,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t.invalid)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await publishClipAction(clip.id, parsed.data)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(when ? t.scheduledToast : t.publishingToast)
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>{t.title}</Label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={100}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>{t.description}</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          maxLength={5000}
          rows={4}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-tags`}>{t.tags}</Label>
        <Input
          id={`${id}-tags`}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
        <p className="text-[13px] text-tertiary">{t.tagsHint}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-privacy`}>{t.privacyLabel}</Label>
        <Select
          items={privacyItems}
          value={effectivePrivacy}
          disabled={scheduled}
          onValueChange={(next) => {
            if (privacyStatuses.includes(next as PrivacyStatus))
              setPrivacy(next as PrivacyStatus)
          }}
        >
          <SelectTrigger id={`${id}-privacy`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {privacyItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scheduled && (
          <p className="text-[13px] text-tertiary">{t.scheduledHint}</p>
        )}
      </div>
      {clip.audioMix?.youtubeSound && (
        <Alert>
          <YoutubeLogoIcon aria-hidden />
          <AlertTitle>{t.soundTitle}</AlertTitle>
          <AlertDescription>
            {t.soundBody(clip.audioMix.youtubeSound.title)}
          </AlertDescription>
        </Alert>
      )}
      {(clip.audioMix?.music.length ?? 0) > 0 && (
        <Alert>
          <WarningIcon aria-hidden />
          <AlertTitle>{t.musicTitle}</AlertTitle>
          <AlertDescription>{t.musicBody}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Switch
          id={`${id}-schedule`}
          checked={scheduled}
          onCheckedChange={(checked) => {
            setScheduled(checked)
            if (checked && !publishAt) {
              setPublishAt(toLocalInputValue(new Date(Date.now() + 3_600_000)))
            }
          }}
        />
        <Label htmlFor={`${id}-schedule`}>{t.schedule}</Label>
      </div>
      {scheduled && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-publish-at`}>{t.publishAt}</Label>
          <Input
            id={`${id}-publish-at`}
            type="datetime-local"
            value={publishAt}
            required
            onChange={(event) => setPublishAt(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-pink">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" variant="primary" disabled={pending}>
          <UploadSimpleIcon data-icon="inline-start" aria-hidden />
          {scheduled ? t.submitSchedule : t.submit}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function PublishDialog({
  clip,
  publishing,
  previous,
  open,
  onOpenChange,
}: {
  clip: PublishClip
  publishing: PublishingState
  previous?: PublicationState["metadata"]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useMessages(review).publish
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.submit}</DialogTitle>
          <DialogDescription>
            {publishing.channel?.title
              ? t.uploadsTo(publishing.channel.title)
              : t.uploads}
          </DialogDescription>
        </DialogHeader>
        <PublishForm
          clip={clip}
          publishing={publishing}
          previous={previous}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export function PublicationStatusView({
  publication,
  live = false,
}: {
  publication: PublicationState
  live?: boolean
}) {
  const locale = useLocale()
  const t = useMessages(review).publication
  const shared = useMessages(common)
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (publication.status === "published" && publication.url) {
    return (
      <a
        href={publication.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-mint underline-offset-2 hover:underline"
      >
        {t.published}
        <ArrowSquareOutIcon aria-hidden className="size-3.5" />
        <span className="sr-only"> {t.newTab}</span>
      </a>
    )
  }

  if (publication.status === "failed") {
    return (
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-pink">{t.failed}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await retryPublicationAction(publication.id)
                if (!result.ok) {
                  toast.error(result.error.message)
                  return
                }
                router.refresh()
              })
            }
          >
            <ArrowsClockwiseIcon data-icon="inline-start" aria-hidden />
            {shared.retry}
          </Button>
        </div>
        {publication.error && (
          <p className="text-xs break-words text-tertiary">
            {translateError(publication.error, locale)}
          </p>
        )}
      </div>
    )
  }

  if (publication.status === "waiting_quota") {
    return (
      <span className="text-xs text-muted-foreground">{t.waitingQuota}</span>
    )
  }

  return (
    <span
      role={live ? "status" : undefined}
      className="text-xs text-muted-foreground"
    >
      {t.publishing(publication.progress)}
    </span>
  )
}
