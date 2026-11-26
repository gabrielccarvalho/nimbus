import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveCaptionStyle } from "@/features/captions/styles"
import { setClipStatusAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"

import type { PublishingState } from "./publish-dialog"

import { ClipsGrid } from "./clips-grid"
import { ClipsReview } from "./clips-review"

const refresh = vi.fn()
const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/clips/actions", () => ({
  setClipStatusAction: vi.fn(),
  approveAllCandidatesAction: vi.fn(),
}))

vi.mock("@/features/publishing/actions", () => ({
  publishClipAction: vi.fn(),
  retryPublicationAction: vi.fn(),
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
    layout,
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

const publishing: PublishingState = {
  channel: { title: "My channel", status: "ok" },
  defaults: { privacy: "public", tags: [], hashtags: "" },
  publications: {},
  publishesLeftToday: null,
}

const meta = {
  title: "t",
  description: "",
  tags: [],
  privacy: "public" as const,
}

const data = {
  projectId: "p1",
  publishing,
  src: "/media/proxy.mp4",
  renders,
  captions: Object.fromEntries(
    clips.map((c) => [c.id, { lanes: [], style, enabled: true }])
  ),
}

beforeEach(() => {
  refresh.mockClear()
  push.mockClear()
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
    expect(screen.getByRole("link", { name: "Clip B" })).toBeVisible()
  })

  it("links every tile straight to that clip's editor", () => {
    render(<ClipsGrid clips={clips} {...data} />)
    expect(screen.getByRole("link", { name: "Clip B" })).toHaveAttribute(
      "href",
      "/projects/p1/clips/b"
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("previews the render on a rendered tile and the source otherwise", () => {
    render(<ClipsGrid clips={clips} {...data} />)
    const video = (name: string) =>
      screen.getByRole("link", { name }).querySelector("video")
    expect(video("Clip B")).toHaveAttribute("src", "/media/b.mp4")
    expect(video("Clip C")).toHaveAttribute("src", "/media/proxy.mp4#t=10.0")
  })

  it("shows a published clip as a link to the video", () => {
    render(
      <ClipsGrid
        clips={clips}
        {...data}
        publishing={{
          ...publishing,
          publications: {
            b: {
              id: "pub1",
              renderAssetId: null,
              metadata: meta,
              status: "published",
              url: "https://youtu.be/abc",
              error: null,
              publishedAt: null,
              stats: null,
              early: false,
              refreshing: false,
            },
          },
        }}
      />
    )
    const link = screen.getByRole("link", { name: /Published/ })
    expect(link).toHaveAttribute("href", "https://youtu.be/abc")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
  })

  it("shows publishing progress and a quota wait on tiles", () => {
    render(
      <ClipsGrid
        clips={clips}
        {...data}
        publishing={{
          ...publishing,
          publications: {
            b: {
              id: "pub1",
              renderAssetId: null,
              metadata: meta,
              status: "uploading",
              url: null,
              error: null,
              progress: 30,
              publishedAt: null,
              stats: null,
              early: false,
              refreshing: false,
            },
            c: {
              id: "pub2",
              renderAssetId: null,
              metadata: meta,
              status: "waiting_quota",
              url: null,
              error: null,
              publishedAt: null,
              stats: null,
              early: false,
              refreshing: false,
            },
          },
        }}
      />
    )
    expect(screen.getByText("Publishing… 30%")).toBeVisible()
    expect(screen.getByText("Waiting for YouTube's daily limit")).toBeVisible()
  })

  it("reject shows an undo toast", async () => {
    vi.mocked(setClipStatusAction).mockResolvedValue({
      ok: true,
      value: undefined,
    })
    render(<ClipsGrid clips={[clips[0]!]} {...data} />)
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }))
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

  it("hover plays one rendered tile at a time and resets it on leave", () => {
    const withD = [...clips, clip("d", "Clip D", { status: "rendered" })]
    const d = { url: "/media/d.mp4", downloadUrl: "/media/d.mp4?download" }
    render(<ClipsGrid clips={withD} {...data} renders={{ ...renders, d }} />)
    const play = vi.mocked(HTMLMediaElement.prototype.play)
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Clip A" }), {
      pointerType: "mouse",
    })
    expect(play).not.toHaveBeenCalled()
    const b = screen.getByRole("link", { name: "Clip B" })
    const bVideo = b.querySelector("video")!
    expect(bVideo).toHaveAttribute("src", "/media/b.mp4")
    fireEvent.pointerEnter(b, { pointerType: "mouse" })
    expect(play.mock.contexts).toEqual([bVideo])
    bVideo.currentTime = 3
    pause.mockClear()
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Clip D" }), {
      pointerType: "mouse",
    })
    expect(pause.mock.contexts).toContain(bVideo)
    expect(play.mock.contexts.at(-1)).toBe(
      screen.getByRole("link", { name: "Clip D" }).querySelector("video")
    )
    expect(bVideo.currentTime).toBe(0)
  })

  it("arrow keys move focus between tiles", async () => {
    render(<ClipsGrid clips={clips} {...data} />)
    const first = screen.getByRole("link", { name: "Clip A" })
    first.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByRole("link", { name: "Clip B" })).toHaveFocus()
    await userEvent.keyboard("{ArrowLeft}")
    expect(first).toHaveFocus()
  })
})

describe("ClipsReview", () => {
  it("clicking a clip on the source strip opens that clip", async () => {
    render(
      <ClipsReview
        clips={clips}
        {...data}
        durationMs={120_000}
        snapshot={
          { id: "p1", status: "ready_for_review", jobs: [], clips: [] } as never
        }
      />
    )
    const strip = screen.getByRole("img", { name: "Clips in the recording" })
    const ranges = strip.querySelectorAll("[data-slot=timeline-range]")
    await userEvent.click(ranges[1]!)
    expect(push).toHaveBeenCalledWith("/projects/p1/clips/b")
  })
})
