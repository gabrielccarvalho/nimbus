import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { saveSettingsAction } from "@/features/settings/actions"
import { defaultAppSettings } from "@/features/settings/schema"

import { SettingsForm } from "./settings-form"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/features/settings/actions", () => ({ saveSettingsAction: vi.fn() }))

const renderRendering = (workerOnline: boolean) =>
  render(
    <SettingsForm
      section="rendering"
      settings={defaultAppSettings}
      claudeAvailable={false}
      workerOnline={workerOnline}
      hardwareEncoder={null}
      transcriptionOff={false}
      installedFonts={[]}
    />
  )

describe("SettingsForm rendering", () => {
  it('settings shows "No worker online" without a heartbeat', () => {
    renderRendering(false)
    expect(screen.getByText("No worker online")).toBeInTheDocument()
    expect(
      screen.getByRole("switch", { name: "Hardware encoding" })
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("hides the alert when a worker is online", () => {
    renderRendering(true)
    expect(screen.queryByText("No worker online")).not.toBeInTheDocument()
  })
})

describe("SettingsForm layout", () => {
  it("saves the default layout for new clips", async () => {
    vi.mocked(saveSettingsAction).mockResolvedValue({
      ok: true,
      value: defaultAppSettings,
    })
    render(
      <SettingsForm
        section="layout"
        settings={defaultAppSettings}
        claudeAvailable={false}
        workerOnline
        hardwareEncoder={null}
        transcriptionOff={false}
        installedFonts={[]}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /^Even split/ }))
    await userEvent.click(screen.getByRole("button", { name: "At the bottom" }))
    await userEvent.click(screen.getByRole("button", { name: "Save layout" }))
    await waitFor(() =>
      expect(saveSettingsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          layoutMode: "split-50",
          camPosition: "bottom",
        })
      )
    )
  })
})
