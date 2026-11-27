"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ProjectSettingsData } from "@/features/projects/queries"
import { useMessages } from "@/lib/i18n/client"

import { overview } from "./messages/overview"
import { ProjectSettingsForm } from "./project-settings-form"

export function ProjectSettingsSheet({
  data,
  open,
  onOpenChange,
}: {
  data: ProjectSettingsData
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useMessages(overview).settingsSheet
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="font-heading text-[19px]">
            {t.title}
          </SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <ProjectSettingsForm
            key={data.project.id}
            data={data}
            onRerun={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
