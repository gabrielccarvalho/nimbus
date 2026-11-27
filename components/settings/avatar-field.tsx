"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { EntityAvatar } from "@/components/app-shell/entity-avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  removeAvatarAction,
  updateAvatarAction,
} from "@/features/accounts/actions"
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { settings } from "./messages"

const SIZE = 256

async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE
    )
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
      "image/webp",
      0.9
    )
  )
}

export function AvatarField({
  target,
  image,
  initials,
  shape = "circle",
}: {
  target: "user" | "workspace"
  image: string | null
  initials: string
  shape?: "circle" | "square"
}) {
  const router = useRouter()
  const { avatar } = useMessages(settings)
  const t = avatar[target]
  const c = useMessages(common)
  const input = React.useRef<HTMLInputElement>(null)
  const [pending, startTransition] = React.useTransition()

  const upload = (file: File) =>
    startTransition(async () => {
      let blob: Blob
      try {
        blob = await squareImage(file)
      } catch {
        toast.error(avatar.unreadable)
        return
      }
      const form = new FormData()
      form.set("image", blob, "avatar")
      const result = await updateAvatarAction(target, form)
      if (!result.ok) toast.error(result.error.message)
      else toast.success(t.updated)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await removeAvatarAction(target)
      if (!result.ok) toast.error(result.error.message)
      else toast.success(t.removed)
      router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-4">
      <EntityAvatar
        image={image}
        initials={initials}
        shape={shape}
        className="size-16 text-[22px]"
      />
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) upload(file)
          }}
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending && <Spinner data-icon="inline-start" />}
          {image ? t.change : t.upload}
        </Button>
        {image && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={remove}>
            {c.remove}
          </Button>
        )}
      </div>
    </div>
  )
}
