import { ChartLineUpIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { Suspense } from "react"

import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { Page } from "@/components/app-shell/page"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getAnalyticsChannel } from "@/features/analytics/queries"

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const channel = await getAnalyticsChannel()

  return (
    <>
      <Suspense>
        <AnalyticsHeader channelTitle={channel?.title ?? null} />
      </Suspense>
      {!channel ? (
        <Page>
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartLineUpIcon />
              </EmptyMedia>
              <EmptyTitle>No channel connected</EmptyTitle>
              <EmptyDescription>
                Connect a YouTube channel to see how your Shorts do.
              </EmptyDescription>
            </EmptyHeader>
            <Link href="/channels" className={buttonVariants({ size: "sm" })}>
              Connect
            </Link>
          </Empty>
        </Page>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {channel.needsReconnect && (
            <div className="px-[18px] pt-[18px]">
              <Alert>
                <AlertDescription>
                  Reconnect YouTube to keep these numbers up to date.
                </AlertDescription>
                <AlertAction>
                  <Link
                    href="/channels"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Reconnect
                  </Link>
                </AlertAction>
              </Alert>
            </div>
          )}
          {children}
        </div>
      )}
    </>
  )
}
