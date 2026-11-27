"use client"

import { shell } from "@/components/app-shell/messages"
import { Page } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n/client"

export default function Loading() {
  const t = useMessages(shell).home
  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page aria-busy>
        <Skeleton className="h-72 rounded-[18px]" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="aspect-video rounded-[14px]" />
          ))}
        </div>
      </Page>
    </>
  )
}
