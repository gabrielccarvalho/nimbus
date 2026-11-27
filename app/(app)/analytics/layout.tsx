import Link from "next/link"

import { Page } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTabs,
  PageHeaderTitle,
  type PageHeaderTab,
} from "@/components/app-shell/page-header"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { getAnalyticsChannel } from "@/features/analytics/queries"

const TABS: PageHeaderTab[] = [
  { href: "/analytics", label: "Overview", exact: true },
  { href: "/analytics/shorts", label: "Shorts" },
  { href: "/analytics/insights", label: "Insights" },
]

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const channel = await getAnalyticsChannel()

  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>{channel?.title ?? "YouTube"}</PageHeaderContext>
          <PageHeaderTitle>Analytics</PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderTabs aria-label="Analytics sections" tabs={TABS} />
      </PageHeader>
      <Page>
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
            {children}
          </>
        )}
      </Page>
    </>
  )
}
