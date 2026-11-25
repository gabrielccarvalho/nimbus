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

import { SettingsSection, SettingsSectionHeader } from "./section"

function usage(count: number) {
  if (count === 0) return "Not used"
  return `Under ${count} ${count === 1 ? "clip" : "clips"}`
}

function TrackRow({ track }: { track: MusicTrackSummary }) {
  const router = useRouter()
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
      toast.success("Track deleted")
      router.refresh()
    })

  return (
    <Item variant="outline">
      <ItemContent>
        <Input
          ref={input}
          aria-label="Track title"
          value={title}
          maxLength={100}
          readOnly={pending}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => rename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") rename(true)
          }}
        />
        <ItemDescription>
          {formatDuration(track.durationMs)} · {usage(track.usedBy)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${track.title}`}
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
              <AlertDialogTitle>Delete “{track.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The file is removed from this workspace. This can&apos;t be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={remove}
              >
                Delete track
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  )
}

export function MusicLibrary({ tracks }: { tracks: MusicTrackSummary[] }) {
  return (
    <SettingsSection aria-labelledby="music-title">
      <SettingsSectionHeader
        id="music-title"
        title="Music library"
        description="Tracks here can go under any clip in this workspace. MP3, M4A, AAC, WAV, OGG or FLAC, up to 50 MB."
      >
        <MusicUploadButton />
      </SettingsSectionHeader>
      {tracks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MusicNotesIcon />
            </EmptyMedia>
            <EmptyTitle>No music yet</EmptyTitle>
            <EmptyDescription>
              Upload a track to put it under your clips.
            </EmptyDescription>
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
