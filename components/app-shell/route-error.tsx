"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useMessages } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { shell } from "./messages"

export function RouteError({ retry }: { retry: () => void }) {
  const t = useMessages(shell).routeError
  const c = useMessages(common)
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningCircleIcon />
        </EmptyMedia>
        <EmptyTitle>{t.title}</EmptyTitle>
        <EmptyDescription>{t.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={retry}>{c.tryAgain}</Button>
      </EmptyContent>
    </Empty>
  )
}
