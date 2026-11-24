"use client"

import { LinkIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { LANGUAGES, SELECTORS } from "@/components/settings/settings-fields"
import { Button } from "@/components/ui/button"
import { Dropzone, DropzoneTrigger } from "@/components/ui/dropzone"
import { FieldError } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { importFromUrlAction } from "@/features/downloads/actions"
import type { ImportOptions, SelectorMode } from "@/features/projects/schema"
import { formatBytes } from "@/lib/format"

import {
  ACCEPT,
  REJECTION_MESSAGES,
  UploadProgress,
  useRecordingUpload,
} from "./project-uploader"

const DEFAULT = "default"

function OptionSelect({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <span className="inline-flex items-center">
      <label htmlFor={id} className="text-[13px] text-tertiary">
        {label}
      </label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => onChange(next ?? DEFAULT)}
      >
        <SelectTrigger
          id={id}
          size="sm"
          className="h-7 gap-1 px-2 text-foreground inset-ring-0 data-[size=sm]:h-7 data-[size=sm]:bg-transparent data-[size=sm]:ps-2 data-[size=sm]:pe-1.5 data-[size=sm]:hover:bg-glass"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  )
}

export function ImportCard({
  maxBytes,
  defaults,
  claudeAvailable,
}: {
  maxBytes: number
  defaults: { language: string; selectorMode: SelectorMode }
  claudeAvailable: boolean
}) {
  const router = useRouter()
  const [options, setOptions] = React.useState<ImportOptions>({})
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const upload = useRecordingUpload(options)

  const languageName = (code: string) =>
    LANGUAGES.find((l) => l.value === code)?.label ?? code
  const selectorName = (mode: SelectorMode) =>
    SELECTORS.find((s) => s.value === mode)?.label ?? mode
  const languages = [
    { value: DEFAULT, label: `Default · ${languageName(defaults.language)}` },
    ...LANGUAGES,
  ]
  const selectors = [
    {
      value: DEFAULT,
      label: `Default · ${selectorName(defaults.selectorMode)}`,
    },
    ...SELECTORS.filter((s) => s.value !== "anthropic" || claudeAvailable),
  ]

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
    <section
      id="import"
      aria-label="Import a recording"
      className="relative isolate scroll-mt-6 overflow-hidden rounded-[18px] bg-graphite before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-[900px] before:w-[1100px] before:-translate-1/2 before:bg-[radial-gradient(closest-side,rgb(120_132_230/0.085),rgb(120_132_230/0.03)_55%,transparent)]"
    >
      <Dropzone
        clickable={false}
        accept={ACCEPT}
        maxSize={maxBytes}
        disabled={upload.progress !== null}
        onFilesAccepted={([file]) => file && void upload.start(file)}
        onFilesRejected={([rejection]) =>
          rejection && toast.error(REJECTION_MESSAGES[rejection.reason])
        }
        className="min-h-0 gap-[18px] rounded-none border-0 px-6 pt-10 pb-7 data-[dragging=true]:inset-ring-2 data-[dragging=true]:inset-ring-lav/60"
      >
        {upload.progress !== null ? (
          <UploadProgress
            progress={upload.progress}
            fileName={upload.fileName}
            preview={upload.preview}
          />
        ) : (
          <>
            <span
              aria-hidden
              className="grid size-[52px] place-items-center rounded-full bg-glass-2 inset-ring-1 inset-ring-white/10 [&_svg]:size-[22px]"
            >
              <UploadSimpleIcon />
            </span>
            <div className="grid gap-1">
              <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
                Drop a recording, or paste a link
              </h2>
              <p className="text-[13px] text-tertiary">
                MP4, MOV, MKV or WebM up to {formatBytes(maxBytes)}. YouTube,
                Twitch VODs and most sites yt-dlp supports.
              </p>
            </div>
            <form
              aria-label="Import from link"
              onSubmit={submit}
              className="grid w-[min(640px,100%)] gap-2 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <InputGroup className="h-11 min-w-0 flex-[1_1_320px] rounded-full">
                  <InputGroupAddon className="ps-3.5">
                    <LinkIcon aria-hidden />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="url"
                    inputMode="url"
                    aria-label="Paste a video link"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={url}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => setUrl(event.target.value)}
                    required
                  />
                </InputGroup>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending && <Spinner data-icon="inline-start" />}
                  Import
                </Button>
                <DropzoneTrigger className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-glass hover:text-foreground">
                  Browse files
                </DropzoneTrigger>
              </div>
              {error && <FieldError>{error}</FieldError>}
            </form>
          </>
        )}
      </Dropzone>
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 bg-white/[0.015] px-[22px] py-3.5 text-[13px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]">
        <span className="mono-label">This import</span>
        <OptionSelect
          id="import-language"
          label="Language"
          items={languages}
          value={options.language ?? DEFAULT}
          onChange={(value) =>
            setOptions((current) => ({
              ...current,
              language: value === DEFAULT ? undefined : value,
            }))
          }
        />
        <OptionSelect
          id="import-selector"
          label="Highlights"
          items={selectors}
          value={options.selectorMode ?? DEFAULT}
          onChange={(value) =>
            setOptions((current) => ({
              ...current,
              selectorMode:
                value === DEFAULT ? undefined : (value as SelectorMode),
            }))
          }
        />
        <span className="ms-auto">
          Only import videos you own or have the rights to use.
        </span>
      </div>
    </section>
  )
}
