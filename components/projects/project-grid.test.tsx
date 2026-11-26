import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  NeedsYouBanner,
  ProjectGrid,
  type ProjectGridItem,
} from "./project-grid"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const project = (overrides: Partial<ProjectGridItem>): ProjectGridItem => ({
  id: "p",
  name: "Stream",
  status: "ready_for_review",
  failedStep: null,
  awaitingManualSelection: false,
  reviewCount: 0,
  clipCount: 0,
  createdAt: "2026-11-20T12:00:00.000Z",
  sourceUrl: null,
  durationMs: 1_000_000,
  width: 1920,
  height: 1080,
  bytes: null,
  thumbnailKey: null,
  progress: null,
  ...overrides,
})

const projects = [
  project({
    id: "a",
    name: "Waiting",
    status: "selecting",
    awaitingManualSelection: true,
  }),
  project({ id: "b", name: "Running", status: "transcribing", progress: 34 }),
  project({ id: "c", name: "Ready", reviewCount: 9, clipCount: 9 }),
  project({ id: "d", name: "Exported", status: "done" }),
]

describe("ProjectGrid", () => {
  it("counts and filters recordings by what they need", async () => {
    render(<ProjectGrid projects={projects} />)
    expect(screen.getByRole("button", { name: "All 4" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.getByText("9 to review")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Needs you 1" }))
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByRole("link", { name: "Waiting" })).toHaveAttribute(
      "href",
      "/projects/a"
    )

    await userEvent.click(screen.getByRole("button", { name: "Exported 1" }))
    expect(screen.getByRole("link", { name: "Exported" })).toBeInTheDocument()
  })
})

describe("NeedsYouBanner", () => {
  it("links straight to the step waiting on the user", () => {
    render(<NeedsYouBanner project={projects[0]!} />)
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/projects/a/clips")
    expect(link).toHaveTextContent("Paste Claude's highlights to continue.")
  })
})
