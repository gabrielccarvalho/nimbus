import {
  Page,
  PageHeader,
  PageLede,
  PageTitle,
} from "@/components/app-shell/page"
import { SettingsNav } from "@/components/settings/settings-nav"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Page className="max-w-[1120px]">
      <PageHeader>
        <PageTitle>Settings</PageTitle>
        <PageLede>
          Your account, your plan, and the defaults every new project starts
          with. Each project can still change its own.
        </PageLede>
      </PageHeader>
      <div className="flex flex-wrap items-start gap-10">
        <SettingsNav />
        <div className="grid min-w-0 flex-[999_1_520px] gap-[22px]">
          {children}
        </div>
      </div>
    </Page>
  )
}
