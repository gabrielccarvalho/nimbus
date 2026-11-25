import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import {
  Page,
  PageHeader,
  PageLede,
  PageTitle,
} from "@/components/app-shell/page"
import { ChannelIcon } from "@/components/channels/channel-icon"
import { Insights } from "@/components/channels/insights"
import { PublishedClips } from "@/components/channels/published-clips"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusPill } from "@/components/ui/status-pill"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getInsights } from "@/features/insights/queries"
import {
  getPublishedClips,
  getYouTubeChannelCard,
} from "@/features/publishing/queries"

export const metadata: Metadata = { title: "Channels" }

const COMING_SOON = [
  { provider: "twitch", name: "Twitch" },
  { provider: "tiktok", name: "TikTok" },
  { provider: "instagram", name: "Instagram" },
] as const

async function YouTubeCard() {
  const { channel, error } = await getYouTubeChannelCard()

  return (
    <section
      aria-labelledby="youtube-channel"
      className="flex flex-wrap items-center gap-4 rounded-[18px] bg-graphite-2 p-5 inset-ring-1 inset-ring-white/6"
    >
      {channel ? (
        <Avatar size="lg">
          {channel.thumbnailUrl && (
            <AvatarImage src={channel.thumbnailUrl} alt="" />
          )}
          <AvatarFallback>{channel.title.slice(0, 1)}</AvatarFallback>
        </Avatar>
      ) : (
        <ChannelIcon provider="youtube" />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h2 id="youtube-channel" className="truncate font-medium">
          {channel?.title ?? "YouTube"}
        </h2>
        <span className="text-[13px] text-muted-foreground">
          {channel
            ? `${channel.publishedCount} ${channel.publishedCount === 1 ? "clip" : "clips"} published`
            : "Connect a channel to publish approved clips as Shorts."}
        </span>
        {error && (
          <span role="alert" className="text-[13px] text-amber">
            {error}
          </span>
        )}
      </div>
      {channel ? (
        channel.needsReconnect ? (
          <StatusPill tone="amber">Needs reconnect</StatusPill>
        ) : (
          <StatusPill tone="mint">Connected</StatusPill>
        )
      ) : null}
      {(!channel || channel.needsReconnect) && (
        <Link
          href="/settings/channels"
          className={buttonVariants({ size: "sm" })}
        >
          {channel ? "Reconnect" : "Connect"}
        </Link>
      )}
    </section>
  )
}

async function PublishedClipsList() {
  return <PublishedClips rows={await getPublishedClips()} />
}

async function InsightsPanel() {
  return <Insights {...await getInsights()} />
}

function YouTubeCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-[18px] bg-graphite-2 p-5 inset-ring-1 inset-ring-white/6">
      <Skeleton className="size-10 rounded-full bg-white/14" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-3.5 w-2/5 bg-white/14" />
        <Skeleton className="h-3 w-1/4 bg-white/9" />
      </div>
    </div>
  )
}

export default function ChannelsPage() {
  return (
    <Page>
      <PageHeader>
        <PageTitle>Channels</PageTitle>
        <PageLede>
          Where your recordings come from and where your clips go.
        </PageLede>
      </PageHeader>
      <Suspense fallback={<YouTubeCardSkeleton />}>
        <YouTubeCard />
      </Suspense>
      <Tabs defaultValue="clips">
        <TabsList aria-label="Channel performance">
          <TabsTrigger value="clips">Published clips</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="clips">
          <Suspense fallback={<Skeleton className="h-40 rounded-[18px]" />}>
            <PublishedClipsList />
          </Suspense>
        </TabsContent>
        <TabsContent value="insights">
          <Suspense fallback={<Skeleton className="h-40 rounded-[18px]" />}>
            <InsightsPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
      <ul className="grid gap-2 sm:grid-cols-3">
        {COMING_SOON.map(({ provider, name }) => (
          <li
            key={provider}
            className="flex items-center gap-3.5 rounded-[14px] bg-graphite-2 p-3.5"
          >
            <ChannelIcon provider={provider} />
            <span className="min-w-0 flex-1 font-medium">{name}</span>
            <StatusPill tone="neutral">Soon</StatusPill>
          </li>
        ))}
      </ul>
    </Page>
  )
}
