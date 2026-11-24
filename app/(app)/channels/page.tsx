import { ArrowRightIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Link from "next/link"

import {
  Page,
  PageHeader,
  PageLede,
  PageTitle,
} from "@/components/app-shell/page"
import { ChannelIcon } from "@/components/channels/channel-icon"
import { buttonVariants } from "@/components/ui/button"
import { SignalDot } from "@/components/ui/signal-dot"
import { Skeleton } from "@/components/ui/skeleton"
import { channelProviders } from "@/features/accounts/schema"

export const metadata: Metadata = { title: "Channels" }

function ChannelSkeleton() {
  return (
    <div className="grid gap-4 rounded-[18px] bg-graphite-2 p-5 inset-ring-1 inset-ring-white/6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl bg-white/14" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-3.5 w-2/5 bg-white/14" />
          <Skeleton className="h-3 w-1/4 bg-white/9" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full bg-white/14" />
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton
            key={i}
            className="aspect-[9/16] rounded-[10px] bg-white/9"
          />
        ))}
      </div>
      <div className="flex gap-6">
        <Skeleton className="h-3 w-16 bg-white/9" />
        <Skeleton className="h-3 w-12 bg-white/9" />
        <Skeleton className="h-3 w-20 bg-white/9" />
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
      <section
        aria-labelledby="channels-soon"
        className="relative isolate grid min-h-[560px] place-items-center overflow-hidden rounded-[22px]"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] content-start gap-[18px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_85%)] blur-[3px] select-none [&_[data-slot=skeleton]]:motion-reduce:animate-none"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <ChannelSkeleton key={i} />
          ))}
        </div>
        <div className="mx-4 grid max-w-[460px] justify-items-center gap-4 rounded-[22px] bg-night/70 px-8 py-9 text-center shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] inset-ring-1 inset-ring-white/8 backdrop-blur-xl">
          <div className="flex -space-x-2">
            {channelProviders.map((provider) => (
              <ChannelIcon
                key={provider}
                provider={provider}
                className="ring-4 ring-night"
              />
            ))}
          </div>
          <span className="flex items-center gap-2">
            <SignalDot tone="lav" lit />
            <span className="mono-label text-lav">Coming soon</span>
          </span>
          <h2
            id="channels-soon"
            className="text-[26px] leading-tight font-semibold tracking-[-0.035em] text-balance"
          >
            Your channels, in one place.
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            New VODs show up here the moment a stream ends, and approved clips
            go out to YouTube Shorts, TikTok and Reels without leaving nimbus.
          </p>
          <Link
            href="/settings/channels"
            className={buttonVariants({ size: "sm", className: "mt-1" })}
          >
            Connect accounts now
            <ArrowRightIcon data-icon="inline-end" aria-hidden />
          </Link>
        </div>
      </section>
    </Page>
  )
}
