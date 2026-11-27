import type { Metadata } from "next"
import { Suspense } from "react"

import {
  AppHeader,
  AppHeaderContext,
  AppHeaderHeading,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "@/components/app-shell/app-header"
import { Page } from "@/components/app-shell/page"
import { ChannelList } from "@/components/settings/account-settings"
import { Skeleton } from "@/components/ui/skeleton"
import { getChannelSettings } from "@/features/accounts/queries"
import { getYouTubeChannelCard } from "@/features/publishing/queries"

export const metadata: Metadata = { title: "Channels" }

async function Channels() {
  const [channels, card] = await Promise.all([
    getChannelSettings(),
    getYouTubeChannelCard(),
  ])
  return (
    <ChannelList
      channels={channels}
      publishedCount={card.channel?.publishedCount ?? null}
    />
  )
}

function ChannelsSkeleton() {
  return (
    <div className="grid gap-2.5" aria-busy>
      <Skeleton className="h-[86px] rounded-[18px]" />
      <Skeleton className="h-[86px] rounded-[18px]" />
    </div>
  )
}

export default function ChannelsPage() {
  return (
    <>
      <AppHeader>
        <AppHeaderHeading>
          <AppHeaderContext>
            Where your recordings come from and where your clips go
          </AppHeaderContext>
          <AppHeaderTitleRow>
            <AppHeaderTitle>Channels</AppHeaderTitle>
          </AppHeaderTitleRow>
        </AppHeaderHeading>
      </AppHeader>
      <Page className="max-w-[960px]">
        <Suspense fallback={<ChannelsSkeleton />}>
          <Channels />
        </Suspense>
      </Page>
    </>
  )
}
