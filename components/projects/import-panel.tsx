"use client"

import { CaretDownIcon } from "@phosphor-icons/react"
import * as React from "react"

import { LANGUAGES, SELECTORS } from "@/components/settings/settings-fields"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ImportOptions, SelectorMode } from "@/features/projects/schema"
import { cn } from "@/lib/utils"

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
  const [open, setOpen] = React.useState(false)
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
    <div className="flex flex-col gap-4">
      <ProjectUploader maxBytes={maxBytes} options={options} />
      <UrlImportForm options={options} />
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={open}
          aria-controls="import-options"
          onClick={() => setOpen((value) => !value)}
        >
          Import options
          <CaretDownIcon
            data-icon="inline-end"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
        {open && (
          <div id="import-options" className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="import-language">Spoken language</FieldLabel>
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
                <SelectTrigger id="import-language" className="w-full">
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
            <Field>
              <FieldLabel htmlFor="import-selector">Highlights</FieldLabel>
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
                <SelectTrigger id="import-selector" className="w-full">
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
        )}
      </div>
    </div>
  )
}
