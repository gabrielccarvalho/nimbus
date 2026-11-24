import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveCaptionStyle } from "@/features/captions/styles"
import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"

import { ClipsGrid } from "./clips-grid"
import { ClipsReview } from "./clips-review"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/clips/actions", () => ({
  setClipStatusAction: vi.fn(),
  approveAllCandidatesAction: vi.fn(),
}))

vi.mock("@/features/projects/actions", () => ({
  findMoreHighlightsAction: vi.fn(),
}))

vi.mock("@/features/render/actions", () => ({
  cancelClipRendersAction: vi.fn(),
  cancelEditRenderAction: vi.fn(),
  renderClipsAction: vi.fn(),
  renderEditAction: vi.fn(),
}))

vi.mock("./use-project-events", () => ({
  useProjectEvents: (snapshot: ProjectSnapshot) => snapshot,
}))

const layout: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
  camPosition: "top",
}

const style = resolveCaptionStyle({ presetId: "" })

function clip(id: string, title: string, overrides: Partial<Clip> = {}) {
  return {
    id,
    projectId: "p1",
    title,
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
    ...overrides,
  } as Clip
}

const clips = [
  clip("a", "Clip A"),
  clip("b", "Clip B", { status: "rendered", startMs: 60_000, endMs: 80_000 }),
  clip("c", "Clip C", { status: "approved" }),
]

const renders = {
  b: { url: "/media/b.mp4", downloadUrl: "/media/b.mp4?download=b.mp4" },
  c: { url: "/media/c-old.mp4", downloadUrl: "/media/c-old.mp4?download" },
}

const data = {
  projectId: "p1",
  src: "/media/proxy.mp4",
  renders,
  layout,
  captions: Object.fromEntries(clips.map((c) => [c.id, { pages: [], style }])),
  captionsEnabled: true,
}

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(toast).mockClear()
  vi.mocked(setClipStatusAction).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockReturnValue()
})

describe("ClipsGrid", () => {
  it("renders a tile per visible clip", () => {
    render(<ClipsGrid clips={clips} {...data} />)
    const list = screen.getByRole("list", { name: "Clips" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Clip B" })).toBeVisible()
  })

  it("clicking a tile opens the player for that clip", async () => {
    render(<ClipsGrid clips={clips} {...data} />)
    await userEvent.click(screen.getByRole("button", { name: "Clip B" }))
    const dialog = await screen.findByRole("dialog", { name: "Clip B" })
    expect(dialog.querySelector("video")).toHaveAttribute("src", "/media/b.mp4")
    expect(
      within(dialog).getByRole("link", { name: /Download/ })
    ).toHaveAttribute("href", renders.b.downloadUrl)
  })

  it("arrow keys move to the next clip", async () => {
    render(<ClipsGrid clips={clips} {...data} />)
    await userEvent.click(screen.getByRole("button", { name: "Clip A" }))
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Clip A" }), {
      key: "ArrowRight",
    })
    expect(
      await screen.findByRole("dialog", { name: "Clip B" })
    ).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    expect(
      await screen.findByRole("dialog", { name: "Clip A" })
    ).toBeInTheDocument()
  })

  it("an approved clip with an old render plays the live preview, not the MP4", async () => {
    render(<ClipsGrid clips={clips} {...data} />)
    await userEvent.click(screen.getByRole("button", { name: "Clip C" }))
    const dialog = await screen.findByRole("dialog", { name: "Clip C" })
    expect(
      within(dialog).getByRole("img", {
        name: "Vertical preview with captions",
      })
    ).toBeInTheDocument()
    const sources = [...document.querySelectorAll("video")].map((v) =>
      v.getAttribute("src")
    )
    expect(sources).not.toContain("/media/c-old.mp4")
    expect(dialog.querySelector("video")).toHaveAttribute(
      "src",
      "/media/proxy.mp4"
    )
    expect(
      within(dialog).queryByRole("link", { name: /Download/ })
    ).not.toBeInTheDocument()
  })

  it("reject shows an undo toast", async () => {
    vi.mocked(setClipStatusAction).mockResolvedValue({
      ok: true,
      value: undefined,
    })
    render(<ClipsGrid clips={clips} {...data} />)
    await userEvent.click(screen.getByRole("button", { name: "Clip A" }))
    const dialog = await screen.findByRole("dialog", { name: "Clip A" })
    const reject = within(dialog).getByRole("button", { name: "Reject" })
    expect(reject).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(reject)
    expect(setClipStatusAction).toHaveBeenCalledWith("p1", "a", "rejected")
    expect(toast).toHaveBeenCalledWith(
      "Rejected “Clip A”",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    )
    const { action } = vi.mocked(toast).mock.calls[0]![1] as unknown as {
      action: { onClick: () => void }
    }
    action.onClick()
    expect(setClipStatusAction).toHaveBeenLastCalledWith("p1", "a", "candidate")
  })

  it("hover plays a rendered tile's MP4 and leaves unrendered tiles alone", () => {
    render(<ClipsGrid clips={clips} {...data} />)
    const play = vi.mocked(HTMLMediaElement.prototype.play)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Clip A" }), {
      pointerType: "mouse",
    })
    expect(play).not.toHaveBeenCalled()
    const tile = screen.getByRole("button", { name: "Clip B" })
    fireEvent.pointerEnter(tile, { pointerType: "mouse" })
    expect(play).toHaveBeenCalledTimes(1)
    expect(tile.querySelector("video")).toHaveAttribute("src", "/media/b.mp4")
  })
})

describe("ClipsReview", () => {
  it("clicking a clip on the source strip opens that clip", async () => {
    render(
      <ClipsReview
        clips={clips}
        {...data}
        durationMs={120_000}
        layoutConfirmed
        snapshot={
          { id: "p1", status: "ready_for_review", jobs: [], clips: [] } as never
        }
      />
    )
    const strip = screen.getByRole("img", { name: "Clips in the recording" })
    const ranges = strip.querySelectorAll("[data-slot=timeline-range]")
    await userEvent.click(ranges[1]!)
    expect(
      await screen.findByRole("dialog", { name: "Clip B" })
    ).toBeInTheDocument()
  })
})
