"use client"

import { GlobeIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setLocaleAction } from "@/features/accounts/actions"
import { useLocale, useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"
import { localeNames, locales, type Locale } from "@/lib/i18n/config"

const ITEMS = locales.map((value) => ({ value, label: localeNames[value] }))

export function LocaleSelect({
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof SelectTrigger>, "children">) {
  const router = useRouter()
  const locale = useLocale()
  const t = useMessages(common)
  const [pending, startTransition] = React.useTransition()

  const change = (next: Locale) =>
    startTransition(async () => {
      const result = await setLocaleAction(next)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.refresh()
    })

  return (
    <Select
      items={ITEMS}
      value={locale}
      onValueChange={(next) => next && next !== locale && change(next)}
      disabled={pending}
    >
      <SelectTrigger size={size} aria-label={t.language} {...props}>
        {size === "sm" && <GlobeIcon className="text-muted-foreground" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end">
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value} lang={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
