"use client"

import { LinkIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { importFromUrlAction } from "@/features/downloads/actions"
import type { ImportOptions } from "@/features/projects/schema"

export function UrlImportForm({ options = {} }: { options?: ImportOptions }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await importFromUrlAction(url, options)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setError(null)
      toast.success("Download started")
      router.push(`/projects/${result.value.projectId}`)
    })
  }

  return (
    <form onSubmit={submit}>
      <Field data-invalid={Boolean(error)} className="gap-3">
        <FieldLabel
          htmlFor="video-url"
          className="font-heading text-lg font-bold"
        >
          Paste a video link
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <InputGroup className="h-10 flex-1">
            <InputGroupAddon>
              <LinkIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id="video-url"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              aria-invalid={Boolean(error)}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </InputGroup>
          <Button
            type="submit"
            disabled={pending}
            className="h-10 px-5 font-semibold"
          >
            {pending && <Spinner data-icon="inline-start" />}
            Import
          </Button>
        </div>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            YouTube, Twitch VODs and most sites yt-dlp supports. Only import
            videos you own or have the rights to use.
          </FieldDescription>
        )}
      </Field>
    </form>
  )
}
