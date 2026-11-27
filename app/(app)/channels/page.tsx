import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { shell } from "@/components/app-shell/messages"
import { Page } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { ChannelIcon } from "@/components/channels/channel-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusPill } from "@/components/ui/status-pill"
import { translateError } from "@/lib/i18n/errors"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { requireViewer } from "@/features/accounts/session"
import { getYouTubeChannelCard } from "@/features/publishing/queries"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(shell)).channels.title }
}

const COMING_SOON = [
  { provider: "twitch", name: "Twitch" },
  { provider: "tiktok", name: "TikTok" },
  { provider: "instagram", name: "Instagram" },
] as const

async function YouTubeCard() {
  const [{ channel, error }, locale] = await Promise.all([
    getYouTubeChannelCard(),
    getLocale(),
  ])
  const t = shell[locale].channels

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
          {channel ? t.published(channel.publishedCount) : t.connectHint}
        </span>
        {error && (
          <span role="alert" className="text-[13px] text-amber">
            {translateError(error, locale)}
          </span>
        )}
      </div>
      {channel ? (
        channel.needsReconnect ? (
          <StatusPill tone="amber">{t.needsReconnect}</StatusPill>
        ) : (
          <StatusPill tone="mint">{t.connected}</StatusPill>
        )
      ) : null}
      {(!channel || channel.needsReconnect) && (
        <Link
          href="/settings/channels"
          className={buttonVariants({ size: "sm" })}
        >
          {channel ? t.reconnect : t.connect}
        </Link>
      )}
    </section>
  )
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

export default async function ChannelsPage() {
  const [{ workspace }, messages] = await Promise.all([
    requireViewer(),
    getMessages(shell),
  ])
  const t = messages.channels
  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>{workspace.name}</PageHeaderContext>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page>
        <Suspense fallback={<YouTubeCardSkeleton />}>
          <YouTubeCard />
        </Suspense>
        <ul className="grid gap-2 sm:grid-cols-3">
          {COMING_SOON.map(({ provider, name }) => (
            <li
              key={provider}
              className="flex items-center gap-3.5 rounded-[14px] bg-graphite-2 p-3.5"
            >
              <ChannelIcon provider={provider} />
              <span className="min-w-0 flex-1 font-medium">{name}</span>
              <StatusPill tone="neutral">{t.soon}</StatusPill>
            </li>
          ))}
        </ul>
      </Page>
    </>
  )
}
