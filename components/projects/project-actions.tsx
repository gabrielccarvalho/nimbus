import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { DeleteProjectDialog } from "./delete-project-dialog"

export function ProjectActions({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <DeleteProjectDialog
          projectId={projectId}
          projectName={projectName}
          redirectTo="/"
        />
      </CardContent>
    </Card>
  )
}
