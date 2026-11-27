import { SettingsHeader } from "@/components/settings/settings-header"
import { SettingsNav } from "@/components/settings/settings-nav"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SettingsHeader />
      <div className="flex flex-1 flex-wrap items-start">
        <SettingsNav />
        <div className="grid min-w-0 flex-[999_1_520px] content-start gap-[18px] self-stretch p-[18px] pb-16 md:shadow-[inset_1px_0_0_var(--hair)]">
          {children}
        </div>
      </div>
    </>
  )
}
