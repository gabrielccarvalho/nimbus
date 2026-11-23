"use client"

import * as React from "react"

import { LANGUAGES, SELECTORS } from "@/components/settings/settings-fields"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ImportOptions, SelectorMode } from "@/features/projects/schema"

import { ProjectUploader } from "./project-uploader"
import { UrlImportForm } from "./url-import-form"

const DEFAULT = "default"

export function ImportPanel({
  maxBytes,
  defaults,
  claudeAvailable,
}: {
  maxBytes: number
  defaults: { language: string; selectorMode: SelectorMode }
  claudeAvailable: boolean
}) {
  const [options, setOptions] = React.useState<ImportOptions>({})
  const languageName = (code: string) =>
    LANGUAGES.find((l) => l.value === code)?.label ?? code
  const selectorName = (mode: SelectorMode) =>
    SELECTORS.find((s) => s.value === mode)?.label ?? mode
  const languages = [
    { value: DEFAULT, label: `Default (${languageName(defaults.language)})` },
    ...LANGUAGES,
  ]
  const selectors = [
    {
      value: DEFAULT,
      label: `Default (${selectorName(defaults.selectorMode)})`,
    },
    ...SELECTORS.filter((s) => s.value !== "anthropic" || claudeAvailable),
  ]

  return (
    <section
      aria-label="New project"
      className="grid overflow-hidden rounded-xl border bg-card text-card-foreground lg:grid-cols-2"
    >
      <div className="grid p-3">
        <ProjectUploader maxBytes={maxBytes} options={options} />
      </div>
      <div className="flex flex-col justify-center border-t p-5 lg:border-s lg:border-t-0 lg:px-8">
        <UrlImportForm options={options} />
      </div>
      <div className="flex flex-col gap-3 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:gap-6 lg:col-span-2">
        <span className="text-sm text-muted-foreground">
          For this recording
        </span>
        <Field className="sm:w-auto sm:flex-row sm:items-center">
          <FieldLabel htmlFor="import-language" className="shrink-0 sm:w-auto">
            Spoken language
          </FieldLabel>
          <Select
            items={languages}
            value={options.language ?? DEFAULT}
            onValueChange={(value) =>
              setOptions((current) => ({
                ...current,
                language: !value || value === DEFAULT ? undefined : value,
              }))
            }
          >
            <SelectTrigger
              id="import-language"
              className="w-full sm:w-auto sm:min-w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem key={language.value} value={language.value}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="sm:w-auto sm:flex-row sm:items-center">
          <FieldLabel htmlFor="import-selector" className="shrink-0 sm:w-auto">
            Highlights
          </FieldLabel>
          <Select
            items={selectors}
            value={options.selectorMode ?? DEFAULT}
            onValueChange={(value) =>
              setOptions((current) => ({
                ...current,
                selectorMode:
                  !value || value === DEFAULT
                    ? undefined
                    : (value as SelectorMode),
              }))
            }
          >
            <SelectTrigger
              id="import-selector"
              className="w-full sm:w-auto sm:min-w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectors.map((selector) => (
                <SelectItem key={selector.value} value={selector.value}>
                  {selector.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </section>
  )
}
