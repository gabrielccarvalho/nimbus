import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-shell/app-sidebar"
import {
  AppBreadcrumbs,
  BreadcrumbLabelsProvider,
} from "@/components/app-shell/breadcrumbs"
import {
  CommandPaletteProvider,
  SearchTrigger,
} from "@/components/app-shell/command-palette"
import { SIDEBAR_COOKIE } from "@/components/app-shell/sidebar-cookie"
import { initials } from "@/features/accounts/schema"
import { requireViewer } from "@/features/accounts/session"
import { usageSummary } from "@/features/accounts/usage"
import { countProjects, listRecentProjects } from "@/features/projects/queries"
import { getDb } from "@/lib/db"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, workspace } = await requireViewer()
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "false"
  const [recent, projectCount, usage] = await Promise.all([
    listRecentProjects(3),
    countProjects(),
    usageSummary(getDb(), workspace),
  ])

  return (
    <CommandPaletteProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-graphite-3 px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="flex min-h-svh flex-col md:flex-row">
        <AppSidebar
          recent={recent}
          projectCount={projectCount}
          defaultCollapsed={collapsed}
          account={{
            name: user.name,
            email: user.email,
            initials: initials(user.name),
            image: user.image ?? null,
          }}
          workspace={{
            name: workspace.name,
            initials: initials(workspace.name),
            image: workspace.image,
            planName: usage.plan.name,
          }}
          usage={{
            renderMinutes: usage.renderMinutes,
            renderMinutesLimit: usage.plan.renderMinutes,
            resetsAt: usage.resetsAt.toISOString(),
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <BreadcrumbLabelsProvider>
            <header className="flex min-h-[58px] flex-wrap items-center gap-3 px-[max(20px,2.5vw)] py-2 shadow-[inset_0_-1px_0_var(--hair)]">
              <AppBreadcrumbs />
              <SearchTrigger />
            </header>
            <main
              id="main"
              tabIndex={-1}
              className="flex flex-1 flex-col outline-none"
            >
              {children}
            </main>
          </BreadcrumbLabelsProvider>
        </div>
      </div>
    </CommandPaletteProvider>
  )
}
