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
  DialogTrigger,
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
  ACTIVE_PUBLICATION_STATUSES,
  privacyStatuses,
  publishInputSchema,
  type PrivacyStatus,
} from "@/features/publishing/schema"

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

const PRIVACY_ITEMS: Array<{ value: PrivacyStatus; label: string }> = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
]

function disabledReason(clip: PublishClip, publishing: PublishingState) {
  if (clip.status !== "rendered") return "Render the latest edit first"
  if (!publishing.channel)
    return "Connect YouTube in Settings › Connected channels"
  if (publishing.channel.status === "needs_reconnect")
    return "Reconnect YouTube in Settings › Connected channels"
  if (publishing.publishesLeftToday === 0)
    return "Your plan's daily publish limit is reached"
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
      setError("Pick a publish time in the future")
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
      setError(parsed.error.issues[0]?.message ?? "Check the publish details")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await publishClipAction(clip.id, parsed.data)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(when ? "Scheduled on YouTube" : "Publishing to YouTube")
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={100}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          maxLength={5000}
          rows={4}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-tags`}>Tags</Label>
        <Input
          id={`${id}-tags`}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
        <p className="text-[13px] text-tertiary">Separate tags with commas.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-privacy`}>Privacy</Label>
        <Select
          items={PRIVACY_ITEMS}
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
            {PRIVACY_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scheduled && (
          <p className="text-[13px] text-tertiary">
            Scheduled videos stay private until they go live.
          </p>
        )}
      </div>
      {clip.audioMix?.youtubeSound && (
        <Alert>
          <YoutubeLogoIcon aria-hidden />
          <AlertTitle>This clip has a sound to add</AlertTitle>
          <AlertDescription>
            Publishing from here uploads it without “
            {clip.audioMix.youtubeSound.title}”. To use the sound, download the
            clip and upload it from the YouTube app with Add sound.
          </AlertDescription>
        </Alert>
      )}
      {(clip.audioMix?.music.length ?? 0) > 0 && (
        <Alert>
          <WarningIcon aria-hidden />
          <AlertTitle>Check the music rights</AlertTitle>
          <AlertDescription>
            Music you don&apos;t own can get this Short claimed or muted by
            YouTube&apos;s Content ID. Nimbus doesn&apos;t check tracks.
          </AlertDescription>
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
        <Label htmlFor={`${id}-schedule`}>Schedule for later</Label>
      </div>
      {scheduled && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-publish-at`}>Publish at</Label>
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
          {scheduled ? "Schedule on YouTube" : "Publish to YouTube"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function PublishDialog({
  clip,
  publishing,
  previous,
}: {
  clip: PublishClip
  publishing: PublishingState
  previous?: PublicationState["metadata"]
}) {
  const [open, setOpen] = React.useState(false)
  const reasonId = React.useId()
  const reason = disabledReason(clip, publishing)

  return (
    <div className="grid gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          disabled={Boolean(reason)}
          aria-describedby={reason ? reasonId : undefined}
          render={<Button size="sm" variant="ghost" />}
        >
          <UploadSimpleIcon data-icon="inline-start" aria-hidden />
          Publish
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish to YouTube</DialogTitle>
            <DialogDescription>
              {publishing.channel?.title
                ? `Uploads to ${publishing.channel.title}.`
                : "Uploads the rendered clip."}
            </DialogDescription>
          </DialogHeader>
          <PublishForm
            clip={clip}
            publishing={publishing}
            previous={previous}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
      {reason && (
        <p id={reasonId} className="text-xs text-tertiary">
          {reason}
        </p>
      )}
    </div>
  )
}

export function PublicationStatusView({
  publication,
  live = false,
}: {
  publication: PublicationState
  live?: boolean
}) {
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
        Published
        <ArrowSquareOutIcon aria-hidden className="size-3.5" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }

  if (publication.status === "failed") {
    return (
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-pink">Publish failed</span>
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
            Retry
          </Button>
        </div>
        {publication.error && (
          <p className="text-xs break-words text-tertiary">
            {publication.error}
          </p>
        )}
      </div>
    )
  }

  if (publication.status === "waiting_quota") {
    return (
      <span className="text-xs text-muted-foreground">
        Waiting for YouTube&apos;s daily limit
      </span>
    )
  }

  return (
    <span
      role={live ? "status" : undefined}
      className="text-xs text-muted-foreground"
    >
      Publishing…
      {publication.progress === undefined ? "" : ` ${publication.progress}%`}
    </span>
  )
}

export function PublishControl({
  clip,
  publishing,
  live,
}: {
  clip: PublishClip
  publishing: PublishingState
  live?: boolean
}) {
  const publication = publishing.publications[clip.id]
  if (!publication || publication.status === "removed") {
    return <PublishDialog clip={clip} publishing={publishing} />
  }
  if (ACTIVE_PUBLICATION_STATUSES.has(publication.status)) {
    return <PublicationStatusView publication={publication} live={live} />
  }
  const edited = publication.renderAssetId !== clip.renderAssetId
  if (publication.status === "published" && !edited) {
    return <PublicationStatusView publication={publication} />
  }
  return (
    <div className="grid gap-1">
      <PublicationStatusView publication={publication} />
      {publication.status === "published" && (
        <span className="text-xs text-tertiary">Edited since publish</span>
      )}
      <PublishDialog
        clip={clip}
        publishing={publishing}
        previous={publication.metadata}
      />
    </div>
  )
}
