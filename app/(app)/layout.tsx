import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { CommandPaletteProvider } from "@/components/app-shell/command-palette"
import { SIDEBAR_COOKIE } from "@/components/app-shell/sidebar-cookie"
import { initials, PLANS } from "@/features/accounts/schema"
import { requireViewer } from "@/features/accounts/session"
import { countProjects, listRecentProjects } from "@/features/projects/queries"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, workspace } = await requireViewer()
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "false"
  const [recent, projectCount] = await Promise.all([
    listRecentProjects(3),
    countProjects(),
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
            planName: PLANS[workspace.plan].name,
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col text-sm leading-[1.45] outline-none"
        >
          {children}
        </main>
      </div>
    </CommandPaletteProvider>
  )
}
