import { render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { StepDetail } from "@/features/pipeline/detail"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"

import { StepDetailView, useNow } from "./step-detail"

type Job = ProjectSnapshot["jobs"][number]

const job = (overrides: Partial<Job>): Job => ({
  id: "job",
  type: "transcribe",
  status: "running",
  progress: 40,
  attempts: 1,
  error: null,
  clipId: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  detail: null,
  ...overrides,
})

const snapshot = (
  jobs: Job[],
  status: ProjectSnapshot["status"] = "transcribing"
): ProjectSnapshot => ({
  id: "p",
  status,
  failedStep: null,
  error: null,
  awaitingManualSelection: false,
  revision: "",
  jobs,
  clips: [],
})

const running = (detail: StepDetail, status?: ProjectSnapshot["status"]) =>
  render(
    <StepDetailView
      snapshot={snapshot([job({ detail })], status)}
      clips={[]}
      videoSrc={null}
    />
  )

describe("StepDetailView", () => {
  it("shows download size, speed and time left", () => {
    running(
      {
        kind: "download",
        downloadedBytes: 50 * 1024 * 1024,
        totalBytes: 200 * 1024 * 1024,
        bytesPerSecond: 5 * 1024 * 1024,
        etaSeconds: 30,
      },
      "downloading"
    )
    expect(screen.getByTestId("download-bytes")).toHaveTextContent(/50.*of 200/)
    expect(screen.getByText(/\/s$/)).toBeInTheDocument()
    expect(screen.getByText(/left$/)).toBeInTheDocument()
  })

  it("streams the transcript with the language and pace", () => {
    running({
      kind: "transcribe",
      phase: "transcribing",
      language: "pt",
      languageSource: "detected",
      text: "corre corre corre",
      words: 300,
      audioMs: 120_000,
    })
    expect(screen.getByText("Transcribing in Portuguese")).toBeInTheDocument()
    expect(screen.getByText("(detected)")).toBeInTheDocument()
    expect(screen.getByText(/300 words · 150 per minute/)).toBeInTheDocument()
    expect(screen.getByRole("log")).toHaveTextContent("corre corre corre")
  })

  it("draws the waveform analyzed so far", () => {
    running(
      {
        kind: "analyze",
        durationMs: 60_000,
        analyzedMs: 30_000,
        waveform: [-30, -20, -70, -25],
        silences: [{ startMs: 10_000, endMs: 12_000 }],
      },
      "analyzing"
    )
    expect(screen.getByText(/0:30 of 1:00 analyzed/)).toBeInTheDocument()
    expect(screen.getByText("1 silence so far")).toBeInTheDocument()
    expect(screen.getByTestId("live-waveform")).toBeInTheDocument()
  })

  it("lists candidates with scores as they're found", () => {
    running(
      {
        kind: "select",
        candidates: [
          { startMs: 5_000, endMs: 30_000, title: "Corre!", score: 0.82 },
        ],
        parts: { done: 1, total: 3 },
      },
      "selecting"
    )
    const list = screen.getByRole("list", { name: "Candidates found so far" })
    expect(list).toHaveTextContent("Corre!")
    expect(list).toHaveTextContent("82")
    expect(screen.getByText(/1 of 3 parts/)).toBeInTheDocument()
  })

  it("shows each clip being rendered with its own progress", () => {
    render(
      <StepDetailView
        snapshot={snapshot(
          [
            job({ id: "a", type: "render_clip", clipId: "c1", progress: 60 }),
            job({
              id: "b",
              type: "render_clip",
              clipId: "c2",
              status: "queued",
              progress: 0,
            }),
          ],
          "rendering"
        )}
        clips={[
          { id: "c1", title: "First", startMs: 0, endMs: 20_000 },
          { id: "c2", title: "Second", startMs: 40_000, endMs: 60_000 },
          { id: "c3", title: "Not rendering", startMs: 0, endMs: 1 },
        ]}
        videoSrc="/media/proxy.mp4"
      />
    )
    const grid = screen.getByRole("list", { name: "Clips being rendered" })
    expect(grid).toHaveTextContent("First")
    expect(grid).toHaveTextContent("60%")
    expect(grid).toHaveTextContent("Waiting")
    expect(grid).not.toHaveTextContent("Not rendering")
  })

  it("ignores a running publish when picking the step to show", () => {
    render(
      <StepDetailView
        snapshot={snapshot([
          job({ id: "publish", type: "publish_clip" }),
          job({
            detail: {
              kind: "transcribe",
              phase: "transcribing",
              language: "pt",
              languageSource: "detected",
              text: "corre",
              words: 1,
              audioMs: 1_000,
            },
          }),
        ])}
        clips={[]}
        videoSrc={null}
      />
    )
    expect(screen.getByRole("log")).toHaveTextContent("corre")
  })

  it("shows nothing without details", () => {
    const { container } = render(
      <StepDetailView
        snapshot={snapshot([job({})])}
        clips={[]}
        videoSrc={null}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe("useNow", () => {
  function Clock() {
    const now = useNow(true)
    return <p data-testid="clock">{now === null ? "none" : "time"}</p>
  }

  it("has no time on the server, so hydration can't disagree with it", () => {
    expect(renderToString(<Clock />)).toContain("none")
  })

  it("has the time in the browser", () => {
    render(<Clock />)
    expect(screen.getByTestId("clock").textContent).toBe("time")
  })
})
