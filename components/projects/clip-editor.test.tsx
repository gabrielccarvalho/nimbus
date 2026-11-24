import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { updateClipAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import { gameplayBox, refitGameplay } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { ProjectSettings } from "@/features/projects/schema"

import { ClipEditor } from "./clip-editor"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock("@/features/clips/actions", () => ({
  updateClipAction: vi.fn(),
  setClipStatusAction: vi.fn(),
  planClipEffectsAction: vi.fn(),
}))

vi.mock("@/features/render/actions", () => ({
  renderClipsAction: vi.fn(),
}))

vi.mock("@/features/layout/actions", () => ({
  confirmLayoutAction: vi.fn(),
}))

vi.mock("@/features/projects/actions", () => ({
  updateProjectSettingsAction: vi.fn(),
}))

vi.mock("./use-project-events", () => ({
  useProjectEvents: (snapshot: ProjectSnapshot) => snapshot,
}))

const W = 1920
const H = 1080

const layout: LayoutInput = {
  webcamRect: { x: 0.7, y: 0.7, w: 0.25, h: 0.25 },
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.2,
  mode: "cam-top",
  camPosition: "top",
}

const clip = {
  id: "c1",
  projectId: "p1",
  title: "Clip",
  hook: "",
  reason: "",
  startMs: 10_000,
  endMs: 40_000,
  score: 0.8,
  status: "candidate",
  error: null,
  renderAssetId: null,
  captionOverrides: null,
  layoutOverride: null,
  effects: null,
} as Clip

const settings = {
  captionStyle: { presetId: "punch", overrides: {} },
  captionsEnabled: true,
} as unknown as ProjectSettings

const snapshot: ProjectSnapshot = {
  id: "p1",
  status: "ready_for_review",
  failedStep: null,
  error: null,
  awaitingManualSelection: false,
  revision: "1",
  jobs: [],
  clips: [{ id: "c1", status: "candidate" }],
}

function renderEditor() {
  return render(
    <ClipEditor
      projectId="p1"
      clip={clip}
      src="/media/proxy.mp4"
      sourceDurationMs={120_000}
      sourceWidth={W}
      sourceHeight={H}
      layout={layout}
      words={[]}
      settings={settings}
      installedFonts={[]}
      snapshot={snapshot}
    />
  )
}

beforeEach(() => {
  vi.mocked(updateClipAction).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

describe("ClipEditor gameplay box", () => {
  it("saves a keyboard-moved gameplay box in the layout override", async () => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: undefined,
    } as never)
    renderEditor()
    const before = gameplayBox(layout, W, H)!
    const region = screen.getByRole("group", { name: "Gameplay region" })
    region.focus()
    await userEvent.keyboard("{ArrowRight}")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls[0]!
    const saved = (edit as { layoutOverride: LayoutInput }).layoutOverride
    expect(saved.gameplayFocusX).toBe(0.5)
    expect(saved.gameplayRect.x).toBeCloseTo(before.x + 0.005)
    expect(saved.gameplayRect.y).toBeCloseTo(before.y)
    expect(saved.gameplayRect.w).toBeCloseTo(before.w)
    expect(saved.webcamRect).toEqual(layout.webcamRect)
  })

  it("keeps the webcam region above the gameplay region", () => {
    renderEditor()
    const gameplay = screen.getByRole("group", { name: "Gameplay region" })
    const webcam = screen.getByRole("group", { name: "Webcam region" })
    expect(
      gameplay.compareDocumentPosition(webcam) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("refits the gameplay box when the mode changes", async () => {
    renderEditor()
    await userEvent.click(screen.getByRole("button", { name: "Even split" }))
    const region = screen.getByRole("group", { name: "Gameplay region" })
    const expected = gameplayBox(
      {
        ...layout,
        mode: "split-50",
        ...refitGameplay(layout, "split-50", W, H),
      },
      W,
      H
    )!
    const { left, top, width, height } = region.style
    expect(parseFloat(left)).toBeCloseTo(expected.x * 100)
    expect(parseFloat(top)).toBeCloseTo(expected.y * 100)
    expect(parseFloat(width)).toBeCloseTo(expected.w * 100)
    expect(parseFloat(height)).toBeCloseTo(expected.h * 100)
  })
})
