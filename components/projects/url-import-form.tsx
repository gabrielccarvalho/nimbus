"use client"

import { LinkIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { importFromUrlAction } from "@/features/downloads/actions"

export function UrlImportForm() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await importFromUrlAction(url)
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
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="video-url">Or import from a link</FieldLabel>
        <InputGroup>
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
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="default"
              disabled={pending}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Import
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
