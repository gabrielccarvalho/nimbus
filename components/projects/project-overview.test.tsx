import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ProjectSnapshot } from "@/features/pipeline/snapshot"

import type { OverviewFacts } from "./overview-steps"
import { ProjectOverview } from "./project-overview"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("./use-project-events", () => ({
  useProjectEvents: (snapshot: ProjectSnapshot) => snapshot,
}))

vi.mock("@/features/layout/actions", () => ({ confirmLayoutAction: vi.fn() }))

vi.mock("@/features/projects/actions", () => ({
  cancelProjectAction: vi.fn(),
  retryProjectAction: vi.fn(),
  resumeProjectAction: vi.fn(),
  startProjectAction: vi.fn(),
}))

const facts: OverviewFacts = {
  sourceUrl: null,
  selectorMode: "heuristic",
  renderQuality: "balanced",
  source: null,
  transcript: null,
  silences: null,
  clipCount: 0,
  layout: null,
}

function job(
  type: ProjectSnapshot["jobs"][number]["type"],
  status: ProjectSnapshot["jobs"][number]["status"],
  progress = 0
): ProjectSnapshot["jobs"][number] {
  return {
    id: `${type}-${status}`,
    type,
    status,
    progress,
    attempts: 1,
    error: null,
    clipId: null,
    startedAt: status === "running" ? new Date().toISOString() : null,
    finishedAt: null,
    detail: null,
  }
}

function overview(jobs: ProjectSnapshot["jobs"]) {
  const snapshot: ProjectSnapshot = {
    id: "p1",
    status: "transcribing",
    failedStep: null,
    error: null,
    awaitingManualSelection: false,
    revision: "1",
    jobs,
    clips: [],
  }
  return render(
    <ProjectOverview initial={snapshot} facts={facts} layout={null} />
  )
}

describe("ProjectOverview", () => {
  it("ignores a running publish_clip job when showing pipeline progress", () => {
    overview([
      job("publish_clip", "running", 70),
      job("transcribe", "running", 20),
    ])
    expect(screen.getAllByText("Transcribing").length).toBeGreaterThan(0)
    expect(screen.queryByText(/publish_clip/)).toBeNull()
    expect(screen.queryByText(/70%/)).toBeNull()
  })

  it("does not report a queued publish_clip job as the pipeline waiting for the worker", () => {
    overview([job("publish_clip", "queued")])
    expect(screen.queryByText("Waiting for the worker…")).toBeNull()
    expect(screen.getByText("Starting…")).toBeVisible()
  })
})
