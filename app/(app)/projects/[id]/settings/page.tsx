import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProjectSettingsForm } from "@/components/projects/project-settings-form"
import { getProjectSettings } from "@/features/projects/queries"

export const metadata: Metadata = { title: "Project settings" }

export default async function ProjectSettingsPage({
  params,
}: PageProps<"/projects/[id]/settings">) {
  const { id } = await params
  const data = await getProjectSettings(id)
  if (!data) notFound()
  return (
    <div className="max-w-3xl">
      <ProjectSettingsForm key={data.project.id} data={data} />
    </div>
  )
}
