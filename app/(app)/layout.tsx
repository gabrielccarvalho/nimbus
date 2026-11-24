import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-shell/app-sidebar"
import {
  AppBreadcrumbs,
  BreadcrumbLabelsProvider,
} from "@/components/app-shell/breadcrumbs"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { listRecentProjects } from "@/features/projects/queries"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const recent = await listRecentProjects(5)

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-background px-3 py-2 text-sm font-medium ring-3 ring-ring/50 focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        Skip to content
      </a>
      <AppSidebar recent={recent} />
      <SidebarInset>
        <BreadcrumbLabelsProvider>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ms-1" />
            <Separator
              orientation="vertical"
              className="me-2 data-[orientation=vertical]:h-4"
            />
            <div className="min-w-0 flex-1">
              <AppBreadcrumbs />
            </div>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="flex flex-1 flex-col gap-6 p-4 outline-none md:p-6"
          >
            {children}
          </main>
        </BreadcrumbLabelsProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
