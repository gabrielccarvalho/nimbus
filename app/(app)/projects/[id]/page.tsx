import { notFound } from "next/navigation"

import { BreadcrumbLabel } from "@/components/app-shell/breadcrumbs"
import { getProject } from "@/features/projects/queries"

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()
  return (
    <>
      <BreadcrumbLabel segment={project.id} label={project.name} />
      <h1 className="font-heading text-2xl font-semibold">{project.name}</h1>
    </>
  )
}
