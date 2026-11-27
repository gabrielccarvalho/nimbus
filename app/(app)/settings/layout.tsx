import { Page, PageLede } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { settings } from "@/components/settings/messages"
import { SettingsNav } from "@/components/settings/settings-nav"
import { requireViewer } from "@/features/accounts/session"
import { getMessages } from "@/lib/i18n/server"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [{ workspace }, t] = await Promise.all([
    requireViewer(),
    getMessages(settings),
  ])
  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>{workspace.name}</PageHeaderContext>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page className="max-w-[1120px]">
        <PageLede>{t.lede}</PageLede>
        <div className="flex flex-wrap items-start gap-10">
          <SettingsNav />
          <div className="grid min-w-0 flex-[999_1_520px] gap-[22px]">
            {children}
          </div>
        </div>
      </Page>
    </>
  )
}
