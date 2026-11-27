import { notFound } from "next/navigation"

import { ProjectHeader } from "@/components/projects/project-header"
import {
  getProjectHeader,
  getProjectSettings,
} from "@/features/projects/queries"

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[id]">) {
  const { id } = await params
  const [header, settings] = await Promise.all([
    getProjectHeader(id),
    getProjectSettings(id),
  ])
  if (!header || !settings) notFound()

  return (
    <div
      data-slot="project-frame"
      className="flex min-h-svh flex-col lg:h-dvh lg:min-h-[720px] lg:overflow-hidden"
    >
      <ProjectHeader data={header} settings={settings} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
