import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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
      englishOnlyModel={false}
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
