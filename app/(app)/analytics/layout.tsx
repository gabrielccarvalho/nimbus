import type { Route } from "next"
import Link from "next/link"

import { analytics } from "@/components/analytics/messages"
import { Page } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTabs,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { getMessages } from "@/lib/i18n/server"
import { getAnalyticsChannel } from "@/features/analytics/queries"

const TABS: {
  href: Route
  label: "overview" | "shorts" | "insights"
  exact?: boolean
}[] = [
  { href: "/analytics", label: "overview", exact: true },
  { href: "/analytics/shorts", label: "shorts" },
  { href: "/analytics/insights", label: "insights" },
]

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [channel, messages] = await Promise.all([
    getAnalyticsChannel(),
    getMessages(analytics),
  ])
  const t = messages.layout

  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>{channel?.title ?? "YouTube"}</PageHeaderContext>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderTabs
          aria-label={t.sections}
          tabs={TABS.map((tab) => ({ ...tab, label: t[tab.label] }))}
        />
      </PageHeader>
      <Page>
        {!channel ? (
          <Empty className="rounded-[18px] bg-graphite">
            <EmptyHeader>
              <EmptyDescription>{t.connectPrompt}</EmptyDescription>
            </EmptyHeader>
            <Link
              href="/settings/channels"
              className={buttonVariants({ size: "sm" })}
            >
              {t.connect}
            </Link>
          </Empty>
        ) : (
          <>
            {channel.needsReconnect && (
              <Alert>
                <AlertDescription>{t.reconnectPrompt}</AlertDescription>
                <AlertAction>
                  <Link
                    href="/settings/channels"
                    className={buttonVariants({ size: "sm" })}
                  >
                    {t.reconnect}
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
