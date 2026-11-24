import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { confirmLayoutAction } from "@/features/layout/actions"
import { gameplayBox } from "@/features/layout/geometry"
import type { LayoutInput } from "@/features/layout/schema"
import type { ProjectSettings } from "@/features/projects/schema"

import { LayoutEditor } from "./layout-editor"

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

vi.mock("@/features/layout/actions", () => ({
  confirmLayoutAction: vi.fn(),
}))

vi.mock("@/features/projects/actions", () => ({
  updateProjectSettingsAction: vi.fn(),
}))

vi.mock("@/features/layout/detect-webcam", () => ({
  detectWebcam: vi.fn(),
}))

const W = 1920
const H = 1080

const layout: LayoutInput = {
  webcamRect: null,
  gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
  gameplayFocusX: 0.5,
  mode: "no-cam-fill",
  camPosition: "top",
}

const settings = {
  captionStyle: { presetId: "punch", overrides: {} },
  captionsEnabled: true,
} as unknown as ProjectSettings

beforeEach(() => {
  vi.mocked(confirmLayoutAction).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

describe("LayoutEditor", () => {
  it("edits the gameplay box instead of a focus slider", async () => {
    vi.mocked(confirmLayoutAction).mockResolvedValue({
      ok: true,
      value: undefined,
    } as never)
    render(
      <LayoutEditor
        projectId="p1"
        src="/media/proxy.mp4"
        sourceWidth={W}
        sourceHeight={H}
        initial={layout}
        initialConfidence={0}
        confirmed
        awaitingConfirmation={false}
        settings={settings}
        captionSample={[]}
        installedFonts={[]}
      />
    )
    expect(screen.queryByRole("slider", { name: "Gameplay focus" })).toBeNull()
    expect(screen.queryByText("Gameplay focus")).toBeNull()
    expect(screen.queryByRole("group", { name: "Webcam region" })).toBeNull()
    const region = screen.getByRole("group", { name: "Gameplay region" })
    region.focus()
    await userEvent.keyboard("{ArrowLeft}")
    await userEvent.click(screen.getByRole("button", { name: "Save layout" }))

    await waitFor(() => expect(confirmLayoutAction).toHaveBeenCalled())
    const { layout: saved } = vi.mocked(confirmLayoutAction).mock
      .calls[0]![1] as { layout: LayoutInput }
    const before = gameplayBox(layout, W, H)!
    expect(saved.gameplayFocusX).toBe(0.5)
    expect(saved.gameplayRect.x).toBeCloseTo(before.x - 0.005)
  })
})
