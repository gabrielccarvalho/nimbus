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
import { cn } from "@/lib/utils"

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
  compact = false,
}: {
  compact?: boolean
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
  const inputRef = React.useRef<HTMLInputElement>(null)

  // "New project" (N, the header button, the palette) lands on #import.
  React.useEffect(() => {
    const focus = () => {
      if (window.location.hash === "#import") inputRef.current?.focus()
    }
    focus()
    window.addEventListener("hashchange", focus)
    return () => window.removeEventListener("hashchange", focus)
  }, [])

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

  const busy = upload.progress !== null
  const optionSelects = (
    <>
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
    </>
  )
  const form = (
    <form
      aria-label="Import from link"
      onSubmit={submit}
      className={cn(
        "grid gap-2 text-start",
        compact ? "min-w-0 flex-[2_1_380px]" : "w-[min(640px,100%)]"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup
          className={cn(
            "min-w-0 flex-[1_1_260px] rounded-full",
            compact ? "h-10" : "h-11"
          )}
        >
          <InputGroupAddon className="ps-3.5">
            <LinkIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
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
        <Button
          type="submit"
          variant={compact ? "default" : "primary"}
          disabled={pending}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Import
        </Button>
        <DropzoneTrigger className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-glass hover:text-foreground focus-visible:focus-ring">
          Browse files
        </DropzoneTrigger>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  )
  const icon = (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-glass-2 inset-ring-1 inset-ring-white/10",
        compact
          ? "size-10 [&_svg]:size-[18px]"
          : "size-[52px] [&_svg]:size-[22px]"
      )}
    >
      <UploadSimpleIcon />
    </span>
  )
  const formats = `MP4, MOV, MKV or WebM up to ${formatBytes(maxBytes)}. YouTube, Twitch VODs and most sites yt-dlp supports.`
  const rights = "Only import videos you own or have the rights to use."

  return (
    <section
      id="import"
      aria-label="Import a recording"
      data-compact={compact || undefined}
      className={cn(
        "relative isolate scroll-mt-6 overflow-hidden rounded-[18px] bg-graphite",
        !compact &&
          "before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-[900px] before:w-[1300px] before:-translate-1/2 before:bg-[radial-gradient(closest-side,rgb(120_132_230/0.085),rgb(120_132_230/0.03)_55%,transparent)]"
      )}
    >
      <Dropzone
        clickable={false}
        accept={ACCEPT}
        maxSize={maxBytes}
        disabled={busy}
        onFilesAccepted={([file]) => file && void upload.start(file)}
        onFilesRejected={([rejection]) =>
          rejection && toast.error(REJECTION_MESSAGES[rejection.reason])
        }
        className={cn(
          "min-h-0 rounded-none border-0 data-[dragging=true]:inset-ring-2 data-[dragging=true]:inset-ring-lav/60",
          compact
            ? "flex-row flex-wrap items-center justify-start gap-x-3.5 gap-y-2.5 px-3.5 py-3 text-start"
            : "gap-[18px] px-6 pt-10 pb-7"
        )}
      >
        {busy ? (
          <UploadProgress
            progress={upload.progress ?? 0}
            fileName={upload.fileName}
            preview={upload.preview}
          />
        ) : compact ? (
          <>
            {icon}
            <div className="grid min-w-0 flex-[1_1_240px] gap-0.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
                Drop a recording, or paste a link
              </h2>
              <p className="text-[12.5px] text-tertiary">{formats}</p>
            </div>
            {form}
          </>
        ) : (
          <>
            {icon}
            <div className="grid gap-1">
              <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
                Drop a recording, or paste a link
              </h2>
              <p className="text-[13px] text-tertiary">{formats}</p>
            </div>
            {form}
          </>
        )}
      </Dropzone>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-[18px] gap-y-2 bg-white/[0.015] text-[13px] text-tertiary shadow-[inset_0_1px_0_var(--hair)]",
          compact ? "px-4 py-2" : "px-[22px] py-3.5"
        )}
      >
        <span className="mono-label">This import</span>
        {optionSelects}
        <span className="ms-auto">{rights}</span>
      </div>
    </section>
  )
}
