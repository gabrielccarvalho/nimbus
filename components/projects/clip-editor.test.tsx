import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setClipStatusAction, updateClipAction } from "@/features/clips/actions"
import type { Clip } from "@/features/clips/repository"
import { detectWebcam } from "@/features/layout/detect-webcam"
import { gameplayBox, refitGameplay } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSnapshot } from "@/features/pipeline/snapshot"
import type { ProjectSettingsData } from "@/features/projects/queries"
import type { ProjectSettings } from "@/features/projects/schema"

import { ClipEditor } from "./clip-editor"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
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

vi.mock("@/features/layout/detect-webcam", () => ({
  detectWebcam: vi.fn(),
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
  layout,
  effects: null,
  audioMix: null,
  textOverlays: [],
} as unknown as Clip

const settings = {
  captionStyle: { presetId: "punch", overrides: {} },
  captionsEnabled: true,
  renderQuality: "standard",
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

async function add(...path: string[]) {
  await userEvent.click(screen.getByRole("button", { name: "Add" }))
  for (const name of path) {
    await userEvent.click(await screen.findByRole("menuitem", { name }))
  }
}

function renderEditor(
  edit: Partial<Clip> = {},
  props: Partial<React.ComponentProps<typeof ClipEditor>> = {}
) {
  return render(
    <ClipEditor
      projectId="p1"
      projectName="Friday stream"
      clip={{ ...clip, ...edit }}
      src="/media/proxy.mp4"
      sourceDurationMs={120_000}
      sourceWidth={W}
      sourceHeight={H}
      fps={30}
      words={[]}
      settings={settings}
      settingsData={{} as ProjectSettingsData}
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
      trendingMusic={Promise.resolve({ status: "no_channel" })}
      loudness={null}
      {...props}
    />
  )
}

function setViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: wide,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

beforeEach(() => {
  setViewport(true)
  vi.mocked(updateClipAction).mockReset()
  vi.mocked(detectWebcam).mockReset()
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
    expect(screen.getByTestId("save-state")).toHaveTextContent("Saving…")
    await waitFor(() =>
      expect(screen.getByTestId("save-state")).toHaveTextContent(
        "Failed: Title is too long"
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
      within(
        screen.getByRole("group", { name: "Effects track 1" })
      ).getAllByRole("button")
    ).toHaveLength(1)
    await userEvent.click(screen.getByRole("tab", { name: "Effects" }))
    expect(
      screen.getByRole("button", { name: "Reset effects to auto" })
    ).toBeInTheDocument()
    expect(updateClipAction).toHaveBeenCalledTimes(1)
  })

  it("keeps the added effect selected when the server reorders the effects", async () => {
    const zoom = (startMs: number) => ({
      kind: "zoom" as const,
      startMs,
      endMs: startMs + 1500,
      scale: 1.4,
      focus: { x: 0.5, y: 0.5 },
      lane: 0,
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
    await add("Effect", "Zoom")
    const zoomTrack = screen.getByRole("group", { name: "Effects track 1" })
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

describe("ClipEditor workspace", () => {
  const zoom = {
    kind: "zoom" as const,
    startMs: 12_000,
    endMs: 13_500,
    scale: 1.4,
    focus: { x: 0.5, y: 0.5 },
    lane: 0,
  }

  beforeEach(() => {
    vi.mocked(setClipStatusAction).mockReset()
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: { effects: null },
    } as never)
  })

  it("names the project, the clip and its place among the others", () => {
    renderEditor()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Clip")
    expect(screen.getByText(/Friday stream · Clip 1 of 2/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to clips" })).toHaveAttribute(
      "href",
      "/projects/p1/clips"
    )
  })

  it("opens the effect's card when an effect is picked on the timeline", async () => {
    renderEditor({ effects: { edited: true, events: [zoom] } })
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Zoom 1.4× at 0:02.0" })
    )
    expect(screen.getByRole("tab", { name: "Effects" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const card = within(screen.getByRole("list", { name: "Effects" }))
    expect(card.getByText("Zoom 1.4×")).toBeInTheDocument()
    expect(card.getByText("0:02.0 → 0:03.5")).toBeInTheDocument()
    expect(
      within(card.getByRole("group", { name: "Strength" })).getByRole(
        "slider",
        { hidden: true }
      )
    ).toHaveValue("1.4")
  })

  it("undoes and redoes an edit from the keyboard", async () => {
    renderEditor()
    await add("Text")
    const track = screen.getByRole("group", { name: "Text track 1" })
    expect(within(track).getAllByRole("button")).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })
    expect(within(track).queryAllByRole("button")).toHaveLength(0)
    fireEvent.keyDown(document.body, {
      key: "z",
      metaKey: true,
      shiftKey: true,
    })
    expect(within(track).getAllByRole("button")).toHaveLength(1)
  })

  it("leaves typing alone when a shortcut key is pressed in a field", async () => {
    renderEditor()
    await userEvent.type(screen.getByLabelText("Title"), "ax")
    expect(screen.getByLabelText("Title")).toHaveValue("Clipax")
    expect(setClipStatusAction).not.toHaveBeenCalled()
  })

  it("approves and rejects from the keyboard", async () => {
    vi.mocked(setClipStatusAction).mockResolvedValue({ ok: true } as never)
    renderEditor()
    fireEvent.keyDown(document.body, { key: "a" })
    await waitFor(() =>
      expect(setClipStatusAction).toHaveBeenCalledWith("p1", "c1", "approved")
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled()
    )
    fireEvent.keyDown(document.body, { key: "x" })
    await waitFor(() =>
      expect(setClipStatusAction).toHaveBeenCalledWith("p1", "c1", "rejected")
    )
  })

  it("moves to the neighbouring clips with the bracket keys", () => {
    push.mockClear()
    renderEditor()
    fireEvent.keyDown(document.body, { key: "[" })
    expect(push).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: "]" })
    expect(push).toHaveBeenCalledWith("/projects/p1/clips/c2")
  })

  it("clears the decision when the active choice is clicked again", async () => {
    vi.mocked(setClipStatusAction).mockResolvedValue({ ok: true } as never)
    renderEditor(
      { status: "approved" },
      {
        snapshot: { ...snapshot, clips: [{ id: "c1", status: "approved" }] },
      }
    )
    const approved = screen.getByRole("button", { name: "Approved" })
    expect(approved).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(approved)
    await waitFor(() =>
      expect(setClipStatusAction).toHaveBeenCalledWith("p1", "c1", "candidate")
    )
  })

  it("says the render is out of date once the clip changes", async () => {
    renderEditor(
      { status: "rendered", renderAssetId: "a1" },
      {
        snapshot: { ...snapshot, clips: [{ id: "c1", status: "rendered" }] },
        render: {
          url: "/media/render.mp4",
          downloadUrl: "/media/render.mp4?download=clip.mp4",
          createdAt: new Date(),
          bytes: 41_000_000,
          width: 1080,
          height: 1920,
          durationMs: 30_000,
        },
      }
    )
    expect(screen.getByTestId("clip-status")).toHaveTextContent("Rendered")
    expect(screen.getByRole("button", { name: "Re-render" })).toBeEnabled()
    await userEvent.type(screen.getByLabelText("Title"), "!")
    expect(screen.getByTestId("clip-status")).toHaveTextContent(
      "Edited since last render"
    )
  })

  it("offers Render when the clip has never been rendered", () => {
    renderEditor()
    expect(screen.getByTestId("clip-status")).toHaveTextContent("Not rendered")
    expect(screen.getByRole("button", { name: "Render" })).toBeEnabled()
  })

  it("moves the inspector into a drawer on a narrow window", async () => {
    setViewport(false)
    renderEditor()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clip settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Clip settings" })
    expect(within(drawer).getAllByRole("tab")).toHaveLength(4)
    expect(within(drawer).getByLabelText("Title")).toHaveValue("Clip")
  })

  it("marks what the Shorts interface covers", async () => {
    renderEditor()
    expect(screen.queryByTestId("safe-zones")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("switch", { name: "Safe zones" }))
    expect(screen.getByTestId("safe-zones")).toHaveTextContent(
      "Covered by Shorts UI"
    )
  })

  it("puts the crop boxes back where they were", async () => {
    renderEditor()
    const reset = screen.getByRole("button", { name: "Reset crop" })
    expect(reset).toBeDisabled()
    const webcam = screen.getByRole("group", { name: "Webcam region" })
    const before = webcam.style.left
    webcam.focus()
    await userEvent.keyboard("{ArrowLeft}")
    expect(webcam.style.left).not.toBe(before)
    await userEvent.click(reset)
    expect(webcam.style.left).toBe(before)
  })

  it("rewrites a caption from the list and keeps its timing", async () => {
    renderEditor({
      captionOverrides: {
        added: [{ startMs: 1000, endMs: 2500, text: "hello" }],
      },
    } as Partial<Clip>)
    await userEvent.click(screen.getByRole("tab", { name: "Captions" }))
    const row = screen.getByRole("textbox", { name: "Caption at 0:01.0" })
    await userEvent.type(row, " there")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({
      captionOverrides: {
        added: [{ startMs: 1000, endMs: 2500, text: "hello there" }],
      },
    })
  })
})

describe("ClipEditor audio and text", () => {
  beforeEach(() => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: { effects: null },
    } as never)
  })

  it("keeps a single inspector next to one timeline under the video", () => {
    renderEditor()
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Details",
      "Captions",
      "Layout",
      "Effects",
    ])
    const timeline = screen.getByRole("region", { name: "Timeline" })
    for (const name of [
      "Text track 1",
      "Captions track",
      "Effects track 1",
      "Video track",
    ]) {
      expect(within(timeline).getByRole("group", { name })).toBeInTheDocument()
    }
  })

  it("adds a text at the playhead and autosaves it", async () => {
    renderEditor({ hook: "Wait for the jump" })
    await add("Text")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({
      textOverlays: [
        {
          text: "Wait for the jump",
          position: "top",
          startMs: 0,
          endMs: 3000,
          lane: 0,
        },
      ],
    })
  })

  it("adds a written caption at the playhead", async () => {
    renderEditor()
    await add("Caption")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({
      captionOverrides: {
        added: [{ startMs: 0, endMs: 1500, text: "New caption" }],
      },
    })
  })

  it("adds a captions track placed apart from the first", async () => {
    renderEditor()
    await add("Track", "Captions track")
    expect(
      screen.getByRole("group", { name: "Captions track 2" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Captions 2 position")).toBeInTheDocument()
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    const lanes = (edit as { captionOverrides: { lanes: unknown[] } })
      .captionOverrides.lanes
    expect(lanes).toEqual([{ baseline: expect.any(Number), captions: [] }])
  })

  it("turns captions off for this clip only", async () => {
    renderEditor()
    expect(screen.getByLabelText("Caption position")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Hide captions" }))
    expect(screen.queryByLabelText("Caption position")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Show captions" })
    ).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({ captionOverrides: { enabled: false } })
  })

  it("mutes the original audio from its track", async () => {
    renderEditor()
    await userEvent.click(
      screen.getByRole("button", { name: "Mute original audio" })
    )
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({ audioMix: { sourceMuted: true, music: [] } })
  })

  it("keeps the music and text when only the title changes", async () => {
    const audioMix = {
      sourceDb: 2,
      sourceMuted: false,
      duck: false,
      music: [
        {
          trackId: "t1",
          startMs: 0,
          endMs: 10_000,
          inMs: 4_000,
          db: -12,
          fadeInMs: 500,
          fadeOutMs: 1_000,
          lane: 0,
        },
      ],
    }
    const textOverlays = [
      {
        text: "Watch this",
        position: "center" as const,
        startMs: 0,
        endMs: 5000,
        lane: 0,
      },
    ]
    renderEditor({ audioMix, textOverlays })
    await userEvent.type(screen.getByLabelText("Title"), "!")
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls.at(-1)!
    expect(edit).toMatchObject({ title: "Clip!", audioMix, textOverlays })
  })
})

describe("ClipEditor gameplay box", () => {
  it("saves a keyboard-moved gameplay box in the clip layout", async () => {
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
    const saved = (edit as { layout: LayoutInput }).layout
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
    await userEvent.click(screen.getByRole("button", { name: "Split" }))
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

  it("finds the webcam inside the clip the first time it opens", async () => {
    vi.mocked(updateClipAction).mockResolvedValue({
      ok: true,
      value: { effects: null },
    })
    vi.mocked(detectWebcam).mockResolvedValue({
      ...layout,
      webcamRect: { x: 0.02, y: 0.6, w: 0.3, h: 0.35 },
      confidence: 0.9,
      facesFound: 8,
      faceDetection: true,
    })
    renderEditor({
      layout: { ...layout, webcamRect: null, mode: "split-50" },
    })
    expect(detectWebcam).toHaveBeenCalledWith(
      "/media/proxy.mp4",
      expect.objectContaining({ range: { startMs: 10_000, endMs: 40_000 } })
    )
    await waitFor(() => expect(updateClipAction).toHaveBeenCalled())
    const [, , edit] = vi.mocked(updateClipAction).mock.calls[0]!
    const saved = (edit as { layout: LayoutInput }).layout
    expect(saved.mode).toBe("split-50")
    expect(saved.webcamRect).toEqual({ x: 0.02, y: 0.6, w: 0.3, h: 0.35 })
  })

  it("leaves a clip with a marked webcam alone until asked", async () => {
    vi.mocked(detectWebcam).mockResolvedValue({
      ...layout,
      confidence: 0.9,
      facesFound: 8,
      faceDetection: true,
    })
    renderEditor()
    expect(detectWebcam).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("tab", { name: "Layout" }))
    await userEvent.click(screen.getByRole("button", { name: "Find webcam" }))
    expect(detectWebcam).toHaveBeenCalledTimes(1)
  })
})
