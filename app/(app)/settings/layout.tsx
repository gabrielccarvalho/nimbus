import { Page, PageLede } from "@/components/app-shell/page"
import {
  PageHeader,
  PageHeaderContext,
  PageHeaderHeading,
  PageHeaderTitle,
} from "@/components/app-shell/page-header"
import { SettingsNav } from "@/components/settings/settings-nav"
import { requireViewer } from "@/features/accounts/session"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { workspace } = await requireViewer()
  return (
    <>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderContext>{workspace.name}</PageHeaderContext>
          <PageHeaderTitle>Settings</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <Page className="max-w-[1120px]">
        <PageLede>
          Your account, and the workspace your projects live in: its plan, its
          Claude key and the defaults every new project starts with.
        </PageLede>
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
