import { notFound } from "next/navigation"

import { BreadcrumbLabel } from "@/components/app-shell/breadcrumbs"
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
    <>
      <BreadcrumbLabel
        segment={header.project.id}
        label={header.project.name}
      />
      <ProjectHeader data={header} settings={settings} />
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-[max(20px,2.5vw)] pt-6 pb-18">
        {children}
      </div>
    </>
  )
}
