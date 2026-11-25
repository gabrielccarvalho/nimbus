import Link from "next/link"

import { AnalyticsNav } from "@/components/analytics/analytics-nav"
import {
  Page,
  PageHeader,
  PageLede,
  PageTitle,
} from "@/components/app-shell/page"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { getAnalyticsChannel } from "@/features/analytics/queries"

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const channel = await getAnalyticsChannel()

  return (
    <Page>
      <PageHeader>
        <PageTitle>Analytics</PageTitle>
        <PageLede>How your Shorts and your channel are doing.</PageLede>
      </PageHeader>
      {!channel ? (
        <Empty className="rounded-[18px] bg-graphite">
          <EmptyHeader>
            <EmptyDescription>
              Connect a YouTube channel to see how your Shorts do.
            </EmptyDescription>
          </EmptyHeader>
          <Link
            href="/settings/channels"
            className={buttonVariants({ size: "sm" })}
          >
            Connect
          </Link>
        </Empty>
      ) : (
        <>
          {channel.needsReconnect && (
            <Alert>
              <AlertDescription>
                Reconnect YouTube to keep these numbers up to date.
              </AlertDescription>
              <AlertAction>
                <Link
                  href="/settings/channels"
                  className={buttonVariants({ size: "sm" })}
                >
                  Reconnect
                </Link>
              </AlertAction>
            </Alert>
          )}
          <AnalyticsNav />
          {children}
        </>
      )}
    </Page>
  )
}
