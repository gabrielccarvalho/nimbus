import { render, screen, waitFor, within } from "@testing-library/react"
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
  audioMix: null,
  textOverlay: null,
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

function renderEditor(edit: Partial<Clip> = {}) {
  return render(
    <ClipEditor
      projectId="p1"
      clip={{ ...clip, ...edit }}
      src="/media/proxy.mp4"
      sourceDurationMs={120_000}
      sourceWidth={W}
      sourceHeight={H}
      layout={layout}
      words={[]}
      settings={settings}
      installedFonts={[]}
      snapshot={snapshot}
      publishing={{
        channel: null,
        defaults: { privacy: "public", tags: [], hashtags: "" },
        publications: {},
        publishesLeftToday: null,
      }}
      siblings={{ index: 0, count: 2, previousId: null, nextId: "c2" }}
      musicTracks={[]}
    />
  )
}

beforeEach(() => {
  vi.mocked(updateClipAction).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

describe("ClipEditor", () => {
  it("autosaves edits and reports failures", async () => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "Title is too long" },
    } as never)
    renderEditor()
    expect(screen.getByTestId("save-state")).toHaveTextContent("Saved")
    await userEvent.type(screen.getByLabelText("Title"), "!")
    expect(screen.getByTestId("save-state")).toHaveTextContent(
      "Unsaved changes"
    )
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent(
        "Not saved: Title is too long"
      )
    )
    expect(updateClipAction).toHaveBeenCalledTimes(1)
  })

  it("shows the effects the server stored after a save", async () => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: {
        effects: {
          edited: false,
          events: [
            {
              kind: "shake",
              intensity: "light",
              startMs: 12_000,
              endMs: 12_500,
            },
          ],
        },
      },
    })
    renderEditor()
    await userEvent.type(screen.getByLabelText("Title"), "!")
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent("Saved")
    )
    expect(
      within(screen.getByRole("group", { name: "Shake" })).getAllByRole(
        "button"
      )
    ).toHaveLength(1)
    expect(screen.getByText(/^Planned from the audio/)).toBeInTheDocument()
    expect(updateClipAction).toHaveBeenCalledTimes(1)
  })

  it("keeps the added effect selected when the server reorders the effects", async () => {
    const zoom = (startMs: number) => ({
      kind: "zoom" as const,
      startMs,
      endMs: startMs + 1500,
      scale: 1.4,
      focus: { x: 0.5, y: 0.5 },
    })
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: {
        effects: {
          edited: true,
          events: [zoom(10_000), zoom(20_000), zoom(30_000)],
        },
      },
    })
    renderEditor({
      effects: { edited: false, events: [zoom(20_000), zoom(30_000)] },
    })
    await userEvent.click(screen.getByRole("button", { name: "Add zoom" }))
    const zoomTrack = screen.getByRole("group", { name: "Zoom" })
    const added = within(zoomTrack).getByRole("button", {
      name: "Zoom 1.4× at 0:00.0",
    })
    expect(added).toHaveAttribute("aria-pressed", "true")
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent("Saved")
    )
    expect(updateClipAction).toHaveBeenCalledTimes(1)
    expect(
      within(zoomTrack).getByRole("button", { pressed: true })
    ).toHaveAccessibleName("Zoom 1.4× at 0:00.0")
  })

  it("links to the neighbouring clips", () => {
    renderEditor()
    expect(screen.getByRole("button", { name: "Previous clip" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "Next clip" })).toHaveAttribute(
      "href",
      "/projects/p1/clips/c2"
    )
  })
})

describe("ClipEditor audio and text", () => {
  beforeEach(() => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: { effects: null },
    } as never)
  })

  it("adds an Audio & text tab that autosaves the overlay", async () => {
    renderEditor({ hook: "Wait for the jump" })
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Details",
      "Layout",
      "Captions",
      "Audio & text",
    ])
    await userEvent.click(screen.getByRole("tab", { name: "Audio & text" }))
    await userEvent.click(
      screen.getByRole("switch", { name: "Show text on the video" })
    )
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({
      textOverlay: {
        text: "Wait for the jump",
        position: "top",
        untilMs: 3000,
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent("Saved")
    )
  })

  it("keeps the music and text when only the title changes", async () => {
    const audioMix = {
      trackId: "t1",
      trackStartMs: 4_000,
      musicDb: -12,
      sourceDb: 2,
      duck: false,
      fadeInMs: 500,
      fadeOutMs: 1_000,
    }
    const textOverlay = {
      text: "Watch this",
      position: "center" as const,
      untilMs: null,
    }
    renderEditor({ audioMix, textOverlay })
    await userEvent.type(screen.getByLabelText("Title"), "!")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({ title: "Clip!", audioMix, textOverlay })
  })
})

describe("ClipEditor gameplay box", () => {
  it("saves a keyboard-moved gameplay box in the layout override", async () => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: { effects: null },
    })
    renderEditor()
    const before = gameplayBox(layout, W, H)!
    const region = screen.getByRole("group", { name: "Gameplay region" })
    region.focus()
    await userEvent.keyboard("{ArrowRight}")

    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent("Saved")
    )
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
    await userEvent.click(screen.getByRole("tab", { name: "Layout" }))
    await userEvent.click(screen.getByRole("button", { name: /^Even split/ }))
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
