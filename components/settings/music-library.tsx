"use client"

import { MusicNotesIcon, TrashIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { MusicUploadButton } from "@/components/music/music-upload-button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
} from "@/components/ui/item"
import {
  deleteMusicTrackAction,
  renameMusicTrackAction,
} from "@/features/music/actions"
import type { MusicTrackSummary } from "@/features/music/schema"
import { formatDuration } from "@/lib/format"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { translateError } from "@/lib/i18n/errors"
import { common } from "@/lib/i18n/common"

import { settings } from "./messages"
import { SettingsSection, SettingsSectionHeader } from "./section"

const POLL_MS = 3000

function TrackRow({ track }: { track: MusicTrackSummary }) {
  const locale = useLocale()
  const router = useRouter()
  const t = useMessages(settings).library
  const c = useMessages(common)
  const [title, setTitle] = React.useState(track.title)
  const [saved, setSaved] = React.useState(track.title)
  const input = React.useRef<HTMLInputElement>(null)
  if (saved !== track.title) {
    setSaved(track.title)
    setTitle(track.title)
  }
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const rename = (refocus = false) => {
    if (pending || title === track.title) return
    startTransition(async () => {
      const result = await renameMusicTrackAction(track.id, title)
      if (!result.ok) {
        toast.error(result.error.message)
        setTitle(track.title)
        return
      }
      router.refresh()
      if (refocus) input.current?.focus()
    })
  }

  const remove = () =>
    startTransition(async () => {
      const result = await deleteMusicTrackAction(track.id)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setOpen(false)
      toast.success(t.deleted)
      router.refresh()
    })

  return (
    <Item variant="outline" role="listitem">
      <ItemContent>
        <Input
          ref={input}
          aria-label={t.trackTitle}
          value={title}
          maxLength={100}
          readOnly={pending}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => rename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") rename(true)
          }}
        />
        {track.status === "processing" ? (
          <ItemDescription className="flex items-center gap-1.5">
            <Spinner aria-label={t.processingTrack(track.title)} />
            <span>{t.processing}</span>
          </ItemDescription>
        ) : track.status === "failed" ? (
          <ItemDescription className="text-destructive">
            {track.error ? translateError(track.error, locale) : t.unreadable}
          </ItemDescription>
        ) : (
          <ItemDescription>
            {formatDuration(track.durationMs)} · {t.usage(track.usedBy)}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.deleteTrack(track.title)}
              />
            }
          >
            <TrashIcon aria-hidden />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <TrashIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>{t.deleteTitle(track.title)}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {c.cancel}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={remove}
              >
                {t.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  )
}

export function MusicLibrary({ tracks }: { tracks: MusicTrackSummary[] }) {
  const router = useRouter()
  const t = useMessages(settings).library
  const anyProcessing = tracks.some((track) => track.status === "processing")

  React.useEffect(() => {
    if (!anyProcessing) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [anyProcessing, router])

  return (
    <SettingsSection aria-labelledby="music-title">
      <SettingsSectionHeader
        id="music-title"
        title={t.title}
        description={t.description}
      >
        <MusicUploadButton />
      </SettingsSectionHeader>
      {tracks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MusicNotesIcon />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {tracks.map((track) => (
            <TrackRow key={track.id} track={track} />
          ))}
        </ItemGroup>
      )}
    </SettingsSection>
  )
}
