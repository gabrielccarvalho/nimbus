import type { Metadata } from "next"

export const metadata: Metadata = { title: "Projects" }

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold">Projects</h1>
      <p className="text-sm text-muted-foreground">
        Upload a recording to find clip-worthy moments.
      </p>
    </div>
  )
}
