import { notFound } from "next/navigation"

import { BreadcrumbLabel } from "@/components/app-shell/breadcrumbs"
import { ProjectNav } from "@/components/projects/project-nav"
import { ProjectStatusBadge } from "@/components/projects/status-badge"
import { getProject } from "@/features/projects/queries"

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[id]">) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <>
      <BreadcrumbLabel segment={project.id} label={project.name} />
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 truncate font-heading text-2xl font-semibold">
            {project.name}
          </h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <ProjectNav projectId={project.id} />
      </div>
      {children}
    </>
  )
}
